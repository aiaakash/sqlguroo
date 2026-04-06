/**
 * Table RAG Service
 * Implements hybrid approach for table selection:
 * 1. Semantic retrieval: Vector search on table names to get top candidates
 * 2. LLM filtering: LLM selects final tables from candidates
 * 3. Schema retrieval: Fetch full schema for selected tables
 */

const { logger } = require('@librechat/data-schemas');
const { getPool } = require('./vectordbService');
const { selectTablesByKeywords } = require('./schemaFilter');
const { filterSchemaByTables } = require('./schemaFilter');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash';

/**
 * Initialize the table_name_embeddings table and indexes
 * @returns {Promise<void>}
 */
async function initializeTableNameEmbeddingsSchema() {
  const pool = getPool();
  
  try {
    // Enable pgvector extension (if not already enabled)
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    
    // Get embedding dimension from env or default to 1536 (openai/text-embedding-3-small)
    const embeddingDimension = parseInt(
      process.env.ANALYTICS_EMBEDDING_DIMENSION || '1536',
      10,
    );

    // Create table_name_embeddings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_name_embeddings (
        id SERIAL PRIMARY KEY,
        connection_id VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        embedding vector(${embeddingDimension}),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_connection_table UNIQUE (connection_id, table_name)
      );
    `);
    
    logger.info('[Table RAG Service] table_name_embeddings table created');

    // Create indexes for efficient queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_connection 
      ON table_name_embeddings(connection_id);
    `);

    // Create HNSW index for fast similarity search (supports up to 16,000 dimensions)
    // HNSW is available in pgvector 0.5.0+ and supports our 1536-dim embeddings
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_table_name_embeddings_hnsw 
        ON table_name_embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);
      logger.info('[Table RAG Service] HNSW vector index created');
    } catch (indexError) {
      logger.warn('[Table RAG Service] HNSW index creation failed, using brute-force scan:', indexError.message);
    }
  } catch (error) {
    logger.error('[Table RAG Service] Error initializing table_name_embeddings schema:', error);
    throw error;
  }
}

/**
 * Upsert table name embeddings in vectordb
 * @param {string} connectionId - Connection ID
 * @param {string} tableName - Table name
 * @param {number[]} embedding - Embedding vector for table name
 * @returns {Promise<void>}
 */
async function upsertTableNameEmbedding(connectionId, tableName, embedding) {
  const pool = getPool();

  if (!connectionId || !tableName || !embedding || !Array.isArray(embedding)) {
    throw new Error('Missing required fields: connectionId, tableName, and embedding array are required');
  }

  try {
    // Convert embedding array to PostgreSQL vector format
    const embeddingStr = `[${embedding.join(',')}]`;

    await pool.query(
      `INSERT INTO table_name_embeddings 
       (connection_id, table_name, embedding, updated_at)
       VALUES ($1, $2, $3::vector, CURRENT_TIMESTAMP)
       ON CONFLICT (connection_id, table_name) 
       DO UPDATE SET
         embedding = EXCLUDED.embedding,
         updated_at = CURRENT_TIMESTAMP;`,
      [connectionId, tableName, embeddingStr],
    );

    logger.debug('[Table RAG Service] Table name embedding upserted', {
      connectionId,
      tableName,
      embeddingLength: embedding.length,
    });
  } catch (error) {
    logger.error('[Table RAG Service] Error upserting table name embedding:', error);
    throw error;
  }
}

/**
 * Delete all table name embeddings for a connection
 * @param {string} connectionId - Connection ID
 * @returns {Promise<void>}
 */
async function deleteTableNameEmbeddingsForConnection(connectionId) {
  const pool = getPool();

  try {
    await pool.query(
      'DELETE FROM table_name_embeddings WHERE connection_id = $1;',
      [connectionId]
    );
    logger.debug('[Table RAG Service] Table name embeddings deleted for connection', { connectionId });
  } catch (error) {
    logger.error('[Table RAG Service] Error deleting table name embeddings:', error);
    throw error;
  }
}

/**
 * Find relevant tables using vector similarity search on table names
 * Stage 1: Semantic retrieval
 * @param {string} connectionId - Connection ID
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} topK - Number of top tables to return (default: 10)
 * @returns {Promise<Array>} Array of table names with similarity scores
 */
async function findRelevantTablesByEmbedding(connectionId, queryEmbedding, topK = 10) {
  const pool = getPool();

  if (!connectionId || !queryEmbedding || !Array.isArray(queryEmbedding)) {
    throw new Error('connectionId and queryEmbedding array are required');
  }

  try {
    // Convert embedding array to PostgreSQL vector format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const result = await pool.query(
      `SELECT 
        table_name,
        -- Calculate similarity: 1 - cosine_distance
        1 - (embedding <=> $1::vector) as similarity
      FROM table_name_embeddings
      WHERE connection_id = $2 
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3;`,
      [embeddingStr, connectionId, topK],
    );

    const tables = result.rows.map((row) => ({
      tableName: row.table_name,
      similarity: parseFloat(row.similarity),
    }));

    logger.debug('[Table RAG Service] Found relevant tables by embedding', {
      connectionId,
      found: tables.length,
      topK,
      tables: tables.map(t => t.tableName),
    });

    return tables;
  } catch (error) {
    // Check if this is a dimension mismatch error
    if (error.message && error.message.includes('different vector dimensions')) {
      logger.warn('[Table RAG Service] Vector dimension mismatch - embeddings need to be regenerated:', {
        error: error.message,
      });
      return [];
    }
    logger.error('[Table RAG Service] Error finding relevant tables by embedding:', error);
    throw error;
  }
}

/**
 * Call OpenRouter API for LLM table filtering
 * @param {string} prompt - The prompt to send
 * @param {string} model - The model to use
 * @returns {Promise<string>} - The response content
 */
async function callOpenRouter(prompt, model = DEFAULT_MODEL) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3080',
      'X-Title': 'LibreChat Analytics',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Build prompt for LLM table filtering
 * Stage 2: LLM filtering
 * @param {Array} candidateTables - Tables from semantic search with scores
 * @param {string} question - User's question
 * @param {Object} schema - Full schema for context
 * @returns {string} - The prompt
 */
function buildLLMFilterPrompt(candidateTables, question, schema) {
  const tableList = candidateTables
    .map((t, index) => `${index + 1}. ${t.tableName} (similarity: ${t.similarity.toFixed(3)})`)
    .join('\n');

  // Get column info for candidate tables to help LLM decide
  const tableDetails = candidateTables.map(t => {
    const tableSchema = schema.tables.find(st => st.name.toLowerCase() === t.tableName.toLowerCase());
    if (tableSchema) {
      const columns = tableSchema.columns.slice(0, 10).map(c => c.name).join(', ');
      const moreCols = tableSchema.columns.length > 10 ? ` (+${tableSchema.columns.length - 10} more)` : '';
      return `  ${t.tableName}: ${columns}${moreCols}`;
    }
    return `  ${t.tableName}: (schema not available)`;
  }).join('\n');

  return `You are a database expert. Given a user's question and candidate tables from semantic search, select the MOST RELEVANT tables (3-5 tables) that are needed to answer the question.

USER QUESTION: ${question}

CANDIDATE TABLES FROM SEMANTIC SEARCH (${candidateTables.length} tables):
${tableList}

TABLE SCHEMA DETAILS:
${tableDetails}

INSTRUCTIONS:
1. Analyze the user's question to understand what data they need
2. Select ONLY the tables that are truly necessary to answer the question
3. Include related tables if JOINs are needed (e.g., foreign key relationships)
4. Be selective - choose 3-5 most relevant tables, not all candidates
5. Consider table relationships and data dependencies
6. If the question asks about "all tables" or database structure, respond with "ALL"

Respond with ONLY a comma-separated list of table names (exact names from the list above), or "ALL" if all tables should be included.

Example response: orders, customers, products

SELECTED TABLES:`;
}

/**
 * Parse LLM response to extract table names
 * @param {string} response - LLM response
 * @param {Array} candidateTables - Valid candidate tables
 * @returns {Array<string>} - Array of selected table names
 */
function parseLLMTableSelection(response, candidateTables) {
  if (!response) {
    return candidateTables.slice(0, 5).map(t => t.tableName);
  }

  const cleanResponse = response.trim().toUpperCase();
  
  // Check if LLM said to use all tables
  if (cleanResponse === 'ALL' || cleanResponse.includes('ALL TABLES')) {
    return candidateTables.map(t => t.tableName);
  }

  // Parse comma-separated table names (handle both commas and newlines)
  const tableNames = response
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  // Validate against candidate tables (case-insensitive matching)
  const candidateNames = candidateTables.map(t => t.tableName.toLowerCase());
  const validTables = [];

  for (const name of tableNames) {
    const lowerName = name.toLowerCase();
    // Find exact match first
    const exactMatch = candidateTables.find((t) => t.tableName.toLowerCase() === lowerName);
    if (exactMatch) {
      validTables.push(exactMatch.tableName);
    } else {
      // Try partial match
      const partialMatch = candidateTables.find((t) => 
        t.tableName.toLowerCase().includes(lowerName) || 
        lowerName.includes(t.tableName.toLowerCase())
      );
      if (partialMatch && !validTables.includes(partialMatch.tableName)) {
        validTables.push(partialMatch.tableName);
      }
    }
  }

  // If no valid tables found, fall back to top tables by similarity
  if (validTables.length === 0) {
    return candidateTables.slice(0, 5).map(t => t.tableName);
  }

  return validTables;
}

// Environment variable defaults for hybrid RAG thresholds
const DEFAULT_SEMANTIC_TOP_K = parseInt(process.env.ANALYTICS_SEMANTIC_TOP_K || '10', 10);
const DEFAULT_LLM_MAX_TABLES = parseInt(process.env.ANALYTICS_LLM_MAX_TABLES || '5', 10);

/**
 * Hybrid table retrieval: Semantic search + LLM filtering
 * Stage 1: Get top K tables by vector similarity on table names (env: ANALYTICS_SEMANTIC_TOP_K, default: 10)
 * Stage 2: LLM selects final N tables from candidates (env: ANALYTICS_LLM_MAX_TABLES, default: 5)
 * 
 * @param {string} connectionId - Connection ID
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {string} question - User's natural language question
 * @param {Object} schema - Full database schema
 * @param {Object} options - Options
 * @returns {Promise<{selectedTables: Array<string>, candidateTables: Array}>} Selected tables and candidates
 */
async function hybridTableRetrieval(connectionId, queryEmbedding, question, schema, options = {}) {
  const {
    semanticTopK = DEFAULT_SEMANTIC_TOP_K,
    llmMaxTables = DEFAULT_LLM_MAX_TABLES,
    model = process.env.ANALYTICS_TABLE_FILTER_MODEL || DEFAULT_MODEL,
  } = options;

  const tableCount = schema?.tables?.length || 0;
  let candidateTables = [];
  
  logger.info('[Table RAG Service] Starting hybrid table retrieval:', {
    connectionId,
    totalTables: tableCount,
    semanticTopK,
    llmMaxTables,
    question: question?.substring(0, 100),
  });

  try {
    // Stage 1: Semantic retrieval - Get candidate tables by vector similarity
    logger.debug('[Table RAG Service] Stage 1: Semantic retrieval');
    candidateTables = await findRelevantTablesByEmbedding(
      connectionId, 
      queryEmbedding, 
      semanticTopK
    );

    if (candidateTables.length === 0) {
      logger.warn('[Table RAG Service] No candidate tables found from semantic search');
      
      // NOTE: Table embedding generation should already be triggered by agentProcessor.
      // This fallback only runs if embeddings weren't generated for some reason.
      // We skip triggering here to avoid race conditions with the lock in embeddingService.
      
      // Fall back to keyword-based selection
      const fallbackTables = selectTablesByKeywords(schema, question, llmMaxTables);
      console.log('[Table RAG Service] Using keyword-based fallback:', {
        selectedTables: fallbackTables,
      });
      return { 
        selectedTables: fallbackTables, 
        candidateTables: [],
        method: 'fallback_keyword_match'
      };
    }

    console.log('[Table RAG Service] Stage 1 complete - Candidate tables:', {
      count: candidateTables.length,
      tables: candidateTables.map(t => ({ name: t.tableName, similarity: t.similarity.toFixed(3) })),
    });

    // Stage 2: LLM filtering - Select final tables from candidates
    logger.debug('[Table RAG Service] Stage 2: LLM filtering');
    const prompt = buildLLMFilterPrompt(candidateTables, question, schema);
    
    const response = await callOpenRouter(prompt, model);
    
    console.log('[Table RAG Service] LLM response:', {
      response: response?.substring(0, 200),
    });

    const selectedTables = parseLLMTableSelection(response, candidateTables);

    // Limit to max tables
    const finalTables = selectedTables.slice(0, llmMaxTables);

    console.log('[Table RAG Service] Stage 2 complete - Selected tables:', {
      count: finalTables.length,
      tables: finalTables,
    });

    logger.info('[Table RAG Service] Hybrid table retrieval successful:', {
      candidateCount: candidateTables.length,
      selectedCount: finalTables.length,
      reduction: `${Math.round((1 - finalTables.length / tableCount) * 100)}%`,
    });

    return {
      selectedTables: finalTables,
      candidateTables,
      method: 'hybrid_semantic_llm'
    };
  } catch (error) {
    logger.error('[Table RAG Service] Error in hybrid table retrieval:', error);
    
    // Fall back to returning top tables by similarity if available
    if (candidateTables && candidateTables.length > 0) {
      const fallbackTables = candidateTables.slice(0, llmMaxTables).map(t => t.tableName);
      return {
        selectedTables: fallbackTables,
        candidateTables,
        method: 'fallback_similarity_only'
      };
    }
    
    // Last resort: return all tables
    return {
      selectedTables: schema.tables.map(t => t.name),
      candidateTables: [],
      method: 'fallback_all_tables'
    };
  }
}

/**
 * Filter schema using hybrid table retrieval approach
 * @param {Object} schema - Full database schema
 * @param {string} connectionId - Connection ID
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {string} question - User's question
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Filtered schema with metadata
 */
async function filterSchemaWithHybridRAG(schema, connectionId, queryEmbedding, question, options = {}) {
  const tableCount = schema?.tables?.length || 0;
  const maxTables = options.maxTables || parseInt(process.env.ANALYTICS_MAX_SCHEMA_TABLES || '15', 10);
  
  // If schema is small, return as-is
  if (tableCount <= maxTables) {
    console.log('[Table RAG Service] Schema is small enough, skipping hybrid filter:', {
      tableCount,
      maxTables,
    });
    return {
      ...schema,
      _filtered: false,
      _originalTableCount: tableCount,
    };
  }

  console.log('[Table RAG Service] Starting hybrid schema filtering:', {
    tableCount,
    maxTables,
    connectionId,
    question: question?.substring(0, 100),
  });

  try {
    const { selectedTables, candidateTables, method } = await hybridTableRetrieval(
      connectionId,
      queryEmbedding,
      question,
      schema,
      {
        semanticTopK: DEFAULT_SEMANTIC_TOP_K,
        llmMaxTables: DEFAULT_LLM_MAX_TABLES,
        ...options,
      }
    );

    console.log('[Table RAG Service] Hybrid retrieval complete:', {
      method,
      candidateCount: candidateTables?.length || 0,
      selectedCount: selectedTables?.length || 0,
      selectedTables,
    });

    const filteredSchema = filterSchemaByTables(schema, selectedTables);

    console.log('[Table RAG Service] Schema filtered:', {
      originalTables: tableCount,
      filteredTables: filteredSchema.tables.length,
      selectedTables,
      filterMethod: method,
    });

    return {
      ...filteredSchema,
      _filterMethod: method,
      _candidateTables: candidateTables?.map(t => ({
        name: t.tableName,
        similarity: t.similarity,
      })) || [],
    };
  } catch (error) {
    logger.error('[Table RAG Service] Error in hybrid RAG filtering:', error);
    console.error('[Table RAG Service] Error in hybrid RAG filtering:', {
      error: error.message,
      connectionId,
      tableCount,
    });
    // Return original schema on error
    return {
      ...schema,
      _filtered: false,
      _originalTableCount: tableCount,
      _filterError: error.message,
    };
  }
}

module.exports = {
  // Schema management
  initializeTableNameEmbeddingsSchema,
  upsertTableNameEmbedding,
  deleteTableNameEmbeddingsForConnection,
  
  // Hybrid retrieval
  findRelevantTablesByEmbedding,
  hybridTableRetrieval,
  filterSchemaWithHybridRAG,
};
