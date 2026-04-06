const { logger } = require('@librechat/data-schemas');
const { querySchemaDocumentation } = require('./schemaDocumentationRAG');
const { initializeSampleDbSchemaDocs, SAMPLE_DB_SYSTEM_USER_ID } = require('./sampleDbService');

/**
 * Schema Filter Service
 * Uses RAG API (preferred) or LLM to select only relevant tables/views from the database schema
 * based on user's question and skills context
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash';

/**
 * Call OpenRouter API to select relevant tables
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
      temperature: 0.1, // Low temperature for consistent results
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
 * Build a compact table summary for the LLM
 * @param {Object} schema - Full database schema
 * @returns {string} - Compact table list
 */
function buildTableSummary(schema) {
  if (!schema || !schema.tables) {
    return '';
  }

  return schema.tables
    .map((table, index) => {
      const cols = table.columns
        .slice(0, 25) // Limit columns shown
        .map((c) => c.name)
        .join(', ');
      const colCount = table.columns.length;
      const moreColsText = colCount > 25 ? ` (+${colCount - 25} more)` : '';
      return `${index + 1}. ${table.name}: ${cols}${moreColsText}`;
    })
    .join('\n');
}

/**
 * Build the prompt for table selection
 * @param {Object} schema - Full database schema
 * @param {string} question - User's question
 * @param {Array} skills - Relevant skills (optional)
 * @returns {string} - The prompt
 */
function buildSelectionPrompt(schema, question, skills = []) {
  const tableSummary = buildTableSummary(schema);
  const tableCount = schema?.tables?.length || 0;

  let skillsContext = '';
  if (skills && skills.length > 0) {
    const skillsList = skills
      .map((s) => `- ${s.title}: ${s.description || ''}`)
      .join('\n');
    skillsContext = `\nUser's selected skills (context hints):\n${skillsList}\n`;
  }

  return `You are a database schema expert. Given a user's question and the available tables, select ONLY the tables that are relevant to answer the question.

USER QUESTION: ${question}
${skillsContext}
AVAILABLE TABLES (${tableCount} total):
${tableSummary}

INSTRUCTIONS:
1. Analyze the user's question to understand what data they need
2. Select tables that contain relevant columns or data
3. Include related tables (e.g., if a fact table references a dimension table)
4. Be conservative - select only what's truly needed (typically 3-8 tables)
5. If the user asks about "all tables", "list tables", or similar, respond with "ALL"

Respond with ONLY a comma-separated list of table names (exact names from the list above), or "ALL" if all tables should be included.

Example response: orders, customers, products, order_items

SELECTED TABLES:`;
}

/**
 * Parse the LLM response to extract table names
 * @param {string} response - LLM response
 * @param {Object} schema - Full schema (for validation)
 * @returns {Array<string>} - Array of table names
 */
function parseTableSelection(response, schema) {
  if (!response) {
    return [];
  }

  const cleanResponse = response.trim().toUpperCase();
  
  // Check if LLM said to use all tables
  if (cleanResponse === 'ALL' || cleanResponse.includes('ALL TABLES')) {
    return schema.tables.map((t) => t.name);
  }

  // Parse comma-separated table names
  const tableNames = response
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  // Validate against actual schema tables (case-insensitive matching)
  const schemaTableNames = schema.tables.map((t) => t.name.toLowerCase());
  const validTables = [];

  for (const name of tableNames) {
    const lowerName = name.toLowerCase();
    // Find exact match first
    const exactMatch = schema.tables.find((t) => t.name.toLowerCase() === lowerName);
    if (exactMatch) {
      validTables.push(exactMatch.name);
    } else {
      // Try partial match (in case LLM truncated the name)
      const partialMatch = schema.tables.find((t) => 
        t.name.toLowerCase().includes(lowerName) || 
        lowerName.includes(t.name.toLowerCase())
      );
      if (partialMatch && !validTables.includes(partialMatch.name)) {
        validTables.push(partialMatch.name);
      }
    }
  }

  return validTables;
}

/**
 * Filter schema to include only relevant tables
 * @param {Object} schema - Full database schema
 * @param {Array<string>} tableNames - Names of tables to include
 * @returns {Object} - Filtered schema
 */
function filterSchemaByTables(schema, tableNames) {
  if (!schema || !schema.tables || tableNames.length === 0) {
    return schema;
  }

  const tableNamesLower = tableNames.map((n) => n.toLowerCase());
  const filteredTables = schema.tables.filter((table) =>
    tableNamesLower.includes(table.name.toLowerCase())
  );

  return {
    ...schema,
    tables: filteredTables,
    _filtered: true,
    _originalTableCount: schema.tables.length,
    _selectedTableCount: filteredTables.length,
  };
}

/**
 * Extract table names mentioned in skills content
 * @param {Array} skills - Array of skill objects
 * @param {Object} schema - Full schema (for validation)
 * @returns {Array<string>} - Table names found in skills
 */
function extractTablesFromSkills(skills, schema) {
  if (!skills || skills.length === 0 || !schema || !schema.tables) {
    return [];
  }

  const schemaTableNames = schema.tables.map((t) => t.name.toLowerCase());
  const foundTables = new Set();

  for (const skill of skills) {
    const content = (skill.content || '').toLowerCase();
    const description = (skill.description || '').toLowerCase();
    const combined = content + ' ' + description;

    for (const table of schema.tables) {
      const tableLower = table.name.toLowerCase();
      // Check if table name appears in skill content (word boundary check)
      const regex = new RegExp(`\\b${tableLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(combined)) {
        foundTables.add(table.name);
      }
    }
  }

  return Array.from(foundTables);
}

/**
 * Filter schema using RAG API schema documentation (preferred method)
 * Extracts table names from relevant schema documentation chunks
 * @param {Object} schema - Full database schema
 * @param {string} question - User's question
 * @param {string} connectionId - Connection ID for RAG API query
 * @param {string} userId - User ID for RAG API query
 * @param {Array} skills - Relevant skills (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<{filteredSchema: Object, schemaDocContext: string}>} - Filtered schema and documentation context
 */
async function filterSchemaWithRAG(schema, question, connectionId, userId, skills = [], options = {}) {
  const {
    maxTables = parseInt(process.env.ANALYTICS_MAX_SCHEMA_TABLES || '10', 10),
    k = 50, // Get more chunks to extract table names from
  } = options;

  const tableCount = schema?.tables?.length || 0;
  if (tableCount <= maxTables) {
    console.log('[Schema Filter] Schema is small enough, skipping RAG filter:', {
      tableCount,
      maxTables,
    });
    // Still try to get schema documentation even for small schemas
    let schemaDocContext = '';
    try {
      schemaDocContext = await querySchemaDocumentation(question, connectionId, userId, { k: 5 });
    } catch (error) {
      logger.debug('[Schema Filter] Could not retrieve schema documentation:', error);
    }
    return { filteredSchema: schema, schemaDocContext };
  }

  console.log('[Schema Filter] Starting RAG-based schema filtering:', {
    totalTables: tableCount,
    maxTables,
    questionLength: question?.length || 0,
    questionPreview: question?.substring(0, 100),
    skillsCount: skills?.length || 0,
    connectionId,
  });

  try {
    // First, extract tables mentioned in skills (these are always included)
    const skillTables = extractTablesFromSkills(skills, schema);
    console.log('[Schema Filter] Tables extracted from skills:', {
      count: skillTables.length,
      tables: skillTables,
    });

    // Use fixed system user ID for sample DB (shared embeddings), regular userId for personal connections
    const schemaQueryUserId = connectionId === 'sample-db' ? SAMPLE_DB_SYSTEM_USER_ID : userId;
    
    // Query RAG API for relevant schema documentation (single call for both filtering and context)
    let schemaDocContext = await querySchemaDocumentation(question, connectionId, schemaQueryUserId, { k });
    
    // For sample database, try to initialize schema docs if not found
    if ((!schemaDocContext || schemaDocContext.length === 0) && connectionId === 'sample-db') {
      console.log('[Schema Filter] Sample DB schema docs not found, attempting to initialize...');
      try {
        const initialized = await initializeSampleDbSchemaDocs();
        if (initialized) {
          // Retry query after initialization (using fixed system user ID)
          schemaDocContext = await querySchemaDocumentation(question, connectionId, SAMPLE_DB_SYSTEM_USER_ID, { k });
          console.log('[Schema Filter] Sample DB schema docs initialized and queried successfully');
        }
      } catch (initError) {
        logger.warn('[Schema Filter] Failed to initialize sample DB schema docs:', initError.message);
      }
    }
    
    if (!schemaDocContext || schemaDocContext.length === 0) {
      console.log('[Schema Filter] No schema documentation found in RAG API, falling back to LLM');
      const filteredSchema = await filterSchemaWithLLM(schema, question, skills, options);
      return { filteredSchema, schemaDocContext: '' };
    }

    // Extract table names from schema documentation context
    const extractedTables = extractTablesFromSchemaDocs(schemaDocContext, schema);
    
    console.log('[Schema Filter] Tables extracted from RAG API schema docs:', {
      count: extractedTables.length,
      tables: extractedTables,
    });

    // Merge with skill tables (ensure they're always included)
    const allTables = [...new Set([...extractedTables, ...skillTables])];
    
    // Limit to maxTables
    const selectedTables = allTables.slice(0, maxTables);

    if (selectedTables.length === 0) {
      console.log('[Schema Filter] No tables extracted from RAG, falling back to LLM');
      const filteredSchema = await filterSchemaWithLLM(schema, question, skills, options);
      return { filteredSchema, schemaDocContext: '' };
    }

    // Filter the schema
    const filteredSchema = filterSchemaByTables(schema, selectedTables);

    console.log('[Schema Filter] RAG-based schema filtering successful:', {
      originalTables: tableCount,
      selectedTables: selectedTables.length,
      filteredTables: filteredSchema.tables.length,
      reduction: `${Math.round((1 - filteredSchema.tables.length / tableCount) * 100)}%`,
      selectedTableNames: selectedTables.slice(0, 10),
    });

    logger.info('[Schema Filter] Schema filtered using RAG API', {
      originalTables: tableCount,
      filteredTables: filteredSchema.tables.length,
    });

    // Return both filtered schema and the documentation context (reuse the same query)
    return { filteredSchema, schemaDocContext };
  } catch (error) {
    console.error('[Schema Filter] Error in RAG-based filtering, falling back to LLM:', error.message);
    logger.error('[Schema Filter] Error in RAG-based filtering, falling back to LLM:', error);
    const filteredSchema = await filterSchemaWithLLM(schema, question, skills, options);
    return { filteredSchema, schemaDocContext: '' };
  }
}

/**
 * Extract table names from schema documentation context
 * @param {string} schemaDocContext - Schema documentation context from RAG API
 * @param {Object} schema - Full schema (for validation)
 * @returns {Array<string>} - Array of table names
 */
function extractTablesFromSchemaDocs(schemaDocContext, schema) {
  if (!schemaDocContext || !schema || !schema.tables) {
    return [];
  }

  const schemaTableNames = schema.tables.map((t) => t.name.toLowerCase());
  const foundTables = new Set();

  // Look for "Table: <table_name>" patterns in the context
  const tablePattern = /Table:\s*([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let match;
  
  while ((match = tablePattern.exec(schemaDocContext)) !== null) {
    const tableName = match[1];
    // Find exact match in schema (case-insensitive)
    const exactMatch = schema.tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
    if (exactMatch) {
      foundTables.add(exactMatch.name);
    }
  }

  return Array.from(foundTables);
}

/**
 * Main function to filter schema using LLM (fallback method)
 * @param {Object} schema - Full database schema
 * @param {string} question - User's question
 * @param {Array} skills - Relevant skills (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Filtered schema
 */
async function filterSchemaWithLLM(schema, question, skills = [], options = {}) {
  const {
    maxTables = parseInt(process.env.ANALYTICS_MAX_SCHEMA_TABLES || '10', 10),
    model = process.env.ANALYTICS_SCHEMA_FILTER_MODEL || DEFAULT_MODEL,
    skipFilter = false,
  } = options;

  // Return full schema if it's small enough
  const tableCount = schema?.tables?.length || 0;
  if (tableCount <= maxTables || skipFilter) {
    console.log('[Schema Filter] Schema is small enough, skipping filter:', {
      tableCount,
      maxTables,
      skipFilter,
    });
    return schema;
  }

  console.log('[Schema Filter] Starting schema filtering:', {
    totalTables: tableCount,
    maxTables,
    questionLength: question?.length || 0,
    questionPreview: question?.substring(0, 100),
    skillsCount: skills?.length || 0,
    model,
  });

  try {
    // First, extract tables mentioned in skills (these are always included)
    const skillTables = extractTablesFromSkills(skills, schema);
    console.log('[Schema Filter] Tables extracted from skills:', {
      count: skillTables.length,
      tables: skillTables,
    });

    // Build and send the prompt
    const prompt = buildSelectionPrompt(schema, question, skills);
    
    console.log('[Schema Filter] Calling LLM for table selection...');
    const response = await callOpenRouter(prompt, model);
    
    console.log('[Schema Filter] LLM response:', {
      responseLength: response?.length || 0,
      responsePreview: response?.substring(0, 200),
    });

    // Parse the response
    let selectedTables = parseTableSelection(response, schema);
    
    // Merge with skill tables (ensure they're always included)
    const allTables = [...new Set([...selectedTables, ...skillTables])];
    
    // If LLM didn't select enough tables, add skill tables as fallback
    if (allTables.length === 0 && skillTables.length > 0) {
      console.log('[Schema Filter] Using skill tables as fallback');
      selectedTables = skillTables;
    } else if (allTables.length === 0) {
      // If no tables selected, use a heuristic approach
      console.log('[Schema Filter] No tables selected, using keyword-based fallback');
      selectedTables = selectTablesByKeywords(schema, question);
    } else {
      selectedTables = allTables;
    }

    // Filter the schema
    const filteredSchema = filterSchemaByTables(schema, selectedTables);

    console.log('[Schema Filter] Schema filtered successfully:', {
      originalTables: tableCount,
      selectedTables: selectedTables.length,
      filteredTables: filteredSchema.tables.length,
      reduction: `${Math.round((1 - filteredSchema.tables.length / tableCount) * 100)}%`,
      selectedTableNames: selectedTables.slice(0, 10),
    });

    logger.info('[Schema Filter] Schema filtered', {
      originalTables: tableCount,
      filteredTables: filteredSchema.tables.length,
      model,
    });

    return filteredSchema;
  } catch (error) {
    console.error('[Schema Filter] Error filtering schema:', error.message);
    logger.error('[Schema Filter] Error filtering schema:', error);
    
    // Fallback to keyword-based selection on error
    console.log('[Schema Filter] Falling back to keyword-based selection');
    const keywordTables = selectTablesByKeywords(schema, question, maxTables);
    return filterSchemaByTables(schema, keywordTables);
  }
}

/**
 * Fallback: Select tables by keyword matching
 * @param {Object} schema - Full schema
 * @param {string} question - User's question
 * @param {number} maxTables - Maximum tables to select
 * @returns {Array<string>} - Selected table names
 */
function selectTablesByKeywords(schema, question, maxTables = 15) {
  if (!schema || !schema.tables || !question) {
    return schema?.tables?.map((t) => t.name) || [];
  }

  const questionLower = question.toLowerCase();
  const words = questionLower.split(/\s+/).filter((w) => w.length > 2);
  
  // Score each table based on keyword matches
  const tableScores = schema.tables.map((table) => {
    let score = 0;
    const tableLower = table.name.toLowerCase();
    const colNames = table.columns.map((c) => c.name.toLowerCase()).join(' ');
    const combined = tableLower + ' ' + colNames;

    for (const word of words) {
      if (combined.includes(word)) {
        score += 1;
      }
      // Bonus for table name match
      if (tableLower.includes(word)) {
        score += 2;
      }
    }

    return { name: table.name, score };
  });

  // Sort by score and take top tables
  tableScores.sort((a, b) => b.score - a.score);
  const selectedTables = tableScores
    .filter((t) => t.score > 0)
    .slice(0, maxTables)
    .map((t) => t.name);

  // If no tables matched, return first N tables
  if (selectedTables.length === 0) {
    return schema.tables.slice(0, maxTables).map((t) => t.name);
  }

  return selectedTables;
}

module.exports = {
  filterSchemaWithRAG,
  filterSchemaWithLLM,
  filterSchemaByTables,
  extractTablesFromSkills,
  selectTablesByKeywords,
  buildTableSummary,
  extractTablesFromSchemaDocs,
};

