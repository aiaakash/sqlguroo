/**
 * Embedding Service
 * Generates embeddings using OpenAI-compatible API (OpenRouter)
 * Used for table names, skills, and query embeddings
 */

const { logger } = require('@librechat/data-schemas');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

// In-memory lock to prevent concurrent embedding generation for the same connection
const embeddingLocks = new Map();

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model to use
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateEmbedding(text, model = DEFAULT_EMBEDDING_MODEL) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for embedding generation');
  }

  try {
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
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response from API');
    }

    logger.debug('[Embedding Service] Generated embedding', {
      textLength: text.length,
      embeddingLength: embedding.length,
      model,
    });

    return embedding;
  } catch (error) {
    logger.error('[Embedding Service] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param {string[]} texts - Array of texts to embed
 * @param {string} model - Embedding model to use
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function generateEmbeddingsBatch(texts, model = DEFAULT_EMBEDDING_MODEL) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Array of texts is required for batch embedding generation');
  }

  try {
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
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Sort embeddings by index to maintain order
    const embeddings = data.data
      ?.sort((a, b) => a.index - b.index)
      ?.map(item => item.embedding);
    
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error('Invalid batch embedding response from API');
    }

    logger.debug('[Embedding Service] Generated batch embeddings', {
      count: texts.length,
      embeddingLength: embeddings[0]?.length,
      model,
    });

    return embeddings;
  } catch (error) {
    logger.error('[Embedding Service] Error generating batch embeddings:', error);
    throw error;
  }
}

/**
 * Generate embeddings for table names in a schema
 * @param {string} connectionId - Connection ID
 * @param {Object} schema - Database schema with tables
 * @returns {Promise<Array<{tableName: string, embedding: number[]}>>}
 */
async function generateTableNameEmbeddings(connectionId, schema) {
  if (!schema || !schema.tables || schema.tables.length === 0) {
    return [];
  }

  const tableNames = schema.tables.map(t => t.name);
  
  logger.info('[Embedding Service] Generating embeddings for table names:', {
    connectionId,
    tableCount: tableNames.length,
  });

  try {
    // Generate embeddings in batch
    const embeddings = await generateEmbeddingsBatch(tableNames);
    
    // Map back to table names
    const results = tableNames.map((tableName, index) => ({
      tableName,
      embedding: embeddings[index],
    }));

    logger.info('[Embedding Service] Generated table name embeddings:', {
      connectionId,
      count: results.length,
    });

    return results;
  } catch (error) {
    logger.error('[Embedding Service] Error generating table name embeddings:', error);
    throw error;
  }
}

/**
 * Store table name embeddings in vectordb
 * @param {string} connectionId - Connection ID
 * @param {Object} schema - Database schema
 * @returns {Promise<number>} - Number of embeddings stored
 */
async function storeTableNameEmbeddings(connectionId, schema) {
  const { 
    upsertTableNameEmbedding, 
    deleteTableNameEmbeddingsForConnection,
    findRelevantTablesByEmbedding
  } = require('./tableRAGService');

  // Check if already locked (another process is generating embeddings)
  if (embeddingLocks.get(connectionId)) {
    console.log('[Embedding Service] Embedding generation already in progress for:', connectionId);
    return 0; // Skip, another process is handling it
  }

  // Set lock
  embeddingLocks.set(connectionId, true);

  try {
    console.log('[Embedding Service] Starting to store table embeddings:', {
      connectionId,
      tableCount: schema?.tables?.length || 0,
    });

    // Check if embeddings already exist (avoid unnecessary regeneration)
    const testEmbedding = await generateEmbedding('test');
    const existingTables = await findRelevantTablesByEmbedding(connectionId, testEmbedding, 1);
    
    if (existingTables.length > 0) {
      console.log('[Embedding Service] Embeddings already exist for:', connectionId, '- skipping regeneration');
      return existingTables.length;
    }
    
    // Delete existing embeddings for this connection
    await deleteTableNameEmbeddingsForConnection(connectionId);
    console.log('[Embedding Service] Deleted existing embeddings');
    
    // Generate new embeddings
    const tableEmbeddings = await generateTableNameEmbeddings(connectionId, schema);
    console.log('[Embedding Service] Generated embeddings:', {
      count: tableEmbeddings.length,
    });
    
    // Store each embedding
    for (const { tableName, embedding } of tableEmbeddings) {
      await upsertTableNameEmbedding(connectionId, tableName, embedding);
    }
    
    console.log('[Embedding Service] Stored all table embeddings:', {
      connectionId,
      count: tableEmbeddings.length,
    });

    logger.info('[Embedding Service] Stored table name embeddings:', {
      connectionId,
      count: tableEmbeddings.length,
    });

    return tableEmbeddings.length;
  } catch (error) {
    console.error('[Embedding Service] Error storing table name embeddings:', error.message);
    logger.error('[Embedding Service] Error storing table name embeddings:', error);
    throw error;
  } finally {
    // Release lock
    embeddingLocks.delete(connectionId);
  }
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateTableNameEmbeddings,
  storeTableNameEmbeddings,
  DEFAULT_EMBEDDING_MODEL,
};
