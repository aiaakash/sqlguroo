const connectorFactory = require('./connectors');
const { logger } = require('@librechat/data-schemas');
const { storeTableNameEmbeddings } = require('./embeddingService');
const { deleteTableNameEmbeddingsForConnection } = require('./tableRAGService');

/**
 * Creates a database connection pool/client using the appropriate connector
 * @param {Object} config - Connection configuration
 * @returns {Promise<any>}
 */
async function createConnection(config) {
  const connector = connectorFactory.getConnector(config.type);
  if (connector.createPool) return await connector.createPool(config);
  if (connector.createClient) return connector.createClient(config);
  return null;
}

/**
 * Store table name embeddings for a connection
 * Called after schema extraction to enable hybrid RAG table retrieval
 * @param {string} connectionId - Connection ID
 * @param {Object} schema - Database schema
 * @returns {Promise<number>} - Number of embeddings stored
 */
async function storeTableEmbeddingsForConnection(connectionId, schema) {
  try {
    console.log('[Connection Service] Storing table embeddings:', {
      connectionId,
      tableCount: schema?.tables?.length || 0,
    });
    
    // Delete existing embeddings first
    await deleteTableNameEmbeddingsForConnection(connectionId);
    
    // Store new embeddings
    const count = await storeTableNameEmbeddings(connectionId, schema);
    
    console.log('[Connection Service] Table embeddings stored successfully:', {
      connectionId,
      tableCount: count,
    });
    
    logger.info('[Connection Service] Stored table embeddings for connection:', {
      connectionId,
      tableCount: count,
    });
    
    return count;
  } catch (error) {
    // Log error but don't fail - table RAG is optional
    console.error('[Connection Service] Failed to store table embeddings:', {
      connectionId,
      error: error.message,
    });
    logger.warn('[Connection Service] Failed to store table embeddings:', {
      connectionId,
      error: error.message,
    });
    return 0;
  }
}

/**
 * Extract schema and optionally store table embeddings
 * @param {Object} config - Connection configuration
 * @param {string} [connectionId] - Optional connection ID to store table embeddings
 * @returns {Promise<Object>} - Database schema
 */
async function extractSchemaAndStoreEmbeddings(config, connectionId) {
  const schema = await extractSchema(config);
  
  // Store table embeddings if connectionId provided
  if (connectionId && schema?.tables?.length > 0) {
    // Fire and forget - don't block on embedding storage
    storeTableEmbeddingsForConnection(connectionId, schema).catch(err => {
      logger.debug('[Connection Service] Background table embedding storage failed:', err.message);
    });
  }
  
  return schema;
}

/**
 * Test a database connection
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} - Test result with success, message, latencyMs, serverVersion
 */
async function testConnection(config) {
  const connector = connectorFactory.getConnector(config.type);
  return await connector.testConnection(config);
}

/**
 * Extract schema information from a database
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} - Database schema
 */
async function extractSchema(config) {
  const connector = connectorFactory.getConnector(config.type);
  return await connector.extractSchema(config);
}

/**
 * Format schema for prompt (simplified version for LLM context)
 * @param {Object} schema - Database schema
 * @returns {string} - Formatted schema string
 */
function formatSchemaForPrompt(schema) {
  if (!schema || !schema.tables) {
    return 'No schema available';
  }

  let formatted = '';

  for (const table of schema.tables) {
    formatted += `Table: ${table.name}`;
    if (table.rowCount) {
      formatted += ` (~${table.rowCount.toLocaleString()} rows)`;
    }
    formatted += '\n';

    formatted += 'Columns:\n';
    for (const col of table.columns) {
      formatted += `  - ${col.name}: ${col.type}`;
      if (col.primaryKey) {
        formatted += ' [PRIMARY KEY]';
      }
      if (col.foreignKey) {
        formatted += ` [FK -> ${col.foreignKey.table}.${col.foreignKey.column}]`;
      }
      if (!col.nullable) {
        formatted += ' [NOT NULL]';
      }
      if (col.comment) {
        formatted += ` -- ${col.comment}`;
      }
      formatted += '\n';
    }

    if (table.sampleData && table.sampleData.length > 0) {
      formatted += 'Sample values: ';
      try {
        const sampleCols = Object.keys(table.sampleData[0]).slice(0, 3);
        const samples = sampleCols
          .map((col) => `${col}="${table.sampleData[0][col]}"`)
          .join(', ');
        formatted += samples + '\n';
      } catch (err) {
        formatted += 'Error fetching sample values\n';
      }
    }

    formatted += '\n';
  }

  return formatted;
}

// Legacy exports for compatibility
async function createMySQLConnection(config) {
  return await connectorFactory.getConnector('mysql').createPool(config);
}

function createBigQueryConnection(config) {
  return connectorFactory.getConnector('bigquery').createClient(config);
}

module.exports = {
  createConnection,
  testConnection,
  extractSchema,
  extractSchemaAndStoreEmbeddings,
  storeTableEmbeddingsForConnection,
  formatSchemaForPrompt,
  createMySQLConnection,
  createBigQueryConnection,
};
