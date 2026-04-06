const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken, logAxiosError } = require('@librechat/api');

/**
 * Schema Documentation RAG Service
 * Handles embedding and querying schema documentation using RAG API
 */

/**
 * Generate schema documentation text from extracted schema
 * @param {Object} schema - Database schema object
 * @param {string} connectionId - Connection ID
 * @param {string} databaseType - Database type (clickhouse, mysql, etc.)
 * @returns {Array<Object>} - Array of documentation chunks with text and metadata
 */
function generateSchemaDocumentation(schema, connectionId, databaseType) {
  console.log('[Schema Docs RAG] 🏗️  Generating schema documentation:', {
    connectionId,
    databaseType,
    tableCount: schema?.tables?.length || 0,
    hasSchema: !!schema,
    hasTables: !!(schema?.tables?.length),
  });

  if (!schema || !schema.tables || schema.tables.length === 0) {
    console.log('[Schema Docs RAG] ⚠️  No schema or tables found, returning empty chunks');
    logger.warn('[Schema Docs RAG] No schema or tables found for documentation generation');
    return [];
  }

  const chunks = [];

  // Generate documentation for each table
  for (const table of schema.tables) {
    // Table overview chunk
    const tableOverview = buildTableOverview(table, databaseType);
    chunks.push({
      text: tableOverview,
      metadata: {
        type: 'schema_doc',
        table: table.name,
        connectionId,
        databaseType,
        chunkType: 'overview',
      },
    });

    // Column detail chunks (batched for efficiency with slow providers like OpenRouter)
    // Batch columns into groups of 10 to reduce chunk count
    const COLUMNS_PER_CHUNK = 10;
    for (let i = 0; i < table.columns.length; i += COLUMNS_PER_CHUNK) {
      const columnBatch = table.columns.slice(i, i + COLUMNS_PER_CHUNK);
      const batchDoc = columnBatch
        .map((col) => buildColumnDocumentation(table, col, databaseType))
        .join('\n\n---\n\n');
      
      chunks.push({
        text: batchDoc,
        metadata: {
          type: 'schema_doc',
          table: table.name,
          columns: columnBatch.map((c) => c.name).join(','),
          connectionId,
          databaseType,
          chunkType: 'column_batch',
        },
      });
    }

    // Relationship chunks (if foreign keys exist)
    const relationships = buildRelationshipDocumentation(table);
    if (relationships.length > 0) {
      for (const rel of relationships) {
        chunks.push({
          text: rel,
          metadata: {
            type: 'schema_doc',
            table: table.name,
            connectionId,
            databaseType,
            chunkType: 'relationship',
          },
        });
      }
    }
  }

  console.log('[Schema Docs RAG] ✅ Generated schema documentation:', {
    connectionId,
    databaseType,
    totalChunks: chunks.length,
    tableCount: schema.tables.length,
    chunkBreakdown: {
      overview: chunks.filter((c) => c.metadata.chunkType === 'overview').length,
      column_batch: chunks.filter((c) => c.metadata.chunkType === 'column_batch').length,
      relationship: chunks.filter((c) => c.metadata.chunkType === 'relationship').length,
    },
  });
  logger.info(`[Schema Docs RAG] Generated ${chunks.length} documentation chunks for ${schema.tables.length} tables`);

  return chunks;
}

/**
 * Build table overview documentation
 */
function buildTableOverview(table, databaseType) {
  let doc = `Table: ${table.name}\n`;
  doc += `Description: `;

  // Use provided description if available, otherwise leave blank
  const description = table.description || '';
  doc += description + '\n\n';

  // Key columns
  const keyColumns = table.columns.filter(
    (c) => c.primaryKey || c.foreignKey,
  );
  if (keyColumns.length > 0) {
    doc += `Key columns:\n`;
    for (const col of keyColumns) {
      doc += `  - ${col.name}`;
      if (col.primaryKey) doc += ' (primary key)';
      if (col.foreignKey) {
        doc += ` (foreign key → ${col.foreignKey.table}.${col.foreignKey.column})`;
      }
      doc += '\n';
    }
    doc += '\n';
  }

  // Table size
  if (table.rowCount) {
    doc += `Table size: ~${table.rowCount.toLocaleString()} rows\n`;
  }

  // Sample data hint
  if (table.sampleData && table.sampleData.length > 0) {
    doc += `Sample data available for understanding data format\n`;
  }

  return doc.trim();
}

/**
 * Build column documentation
 */
function buildColumnDocumentation(table, column, databaseType) {
  let doc = `Table: ${table.name}\n`;
  doc += `Column: ${column.name}\n`;
  doc += `Type: ${column.type}\n`;

  // Use provided description if available, otherwise leave blank
  const description = column.description || '';
  doc += `Description: ${description}\n`;

  // Constraints
  const constraints = [];
  if (column.primaryKey) constraints.push('primary key');
  if (!column.nullable) constraints.push('NOT NULL');
  if (column.foreignKey) {
    constraints.push(
      `foreign key → ${column.foreignKey.table}.${column.foreignKey.column}`,
    );
  }
  if (constraints.length > 0) {
    doc += `Constraints: ${constraints.join(', ')}\n`;
  }

  // Comment if available
  if (column.comment) {
    doc += `Database comment: ${column.comment}\n`;
  }

  // Usage hints based on type
  const usageHints = getUsageHints(column, databaseType);
  if (usageHints.length > 0) {
    doc += `Usage: ${usageHints.join(', ')}\n`;
  }

  return doc.trim();
}

/**
 * Build relationship documentation
 */
function buildRelationshipDocumentation(table) {
  const relationships = [];
  const fkColumns = table.columns.filter((c) => c.foreignKey);

  for (const col of fkColumns) {
    const fk = col.foreignKey;
    let rel = `Table: ${table.name}\n`;
    rel += `Relationship: ${table.name} → ${fk.table}\n`;
    rel += `Via column: ${col.name} → ${fk.column}\n`;
    rel += `Type: many-to-one (each ${table.name} record belongs to one ${fk.table} record)\n`;
    rel += `Common JOIN pattern: JOIN ${fk.table} ON ${table.name}.${col.name} = ${fk.table}.${fk.column}\n`;

    relationships.push(rel.trim());
  }

  return relationships;
}

/**
 * Infer table description from name and structure
 */
function inferTableDescription(table) {
  const tableName = table.name.toLowerCase();
  const colNames = table.columns.map((c) => c.name.toLowerCase()).join(' ');

  // Common patterns
  if (tableName.includes('order')) {
    return `Contains customer orders with timestamps, status, and payment information. Each row represents a single order placed by a customer.`;
  }
  if (tableName.includes('customer') || tableName.includes('user')) {
    return `Contains customer/user information and profile data. Each row represents a single customer or user.`;
  }
  if (tableName.includes('product')) {
    return `Contains product catalog information. Each row represents a single product.`;
  }
  if (tableName.includes('item')) {
    return `Contains item details. Each row represents a single item.`;
  }
  if (tableName.includes('transaction') || tableName.includes('payment')) {
    return `Contains transaction or payment records. Each row represents a single transaction.`;
  }
  if (tableName.includes('log') || tableName.includes('event')) {
    return `Contains log entries or event records. Each row represents a single log entry or event.`;
  }
  if (colNames.includes('date') || colNames.includes('timestamp')) {
    return `Contains time-series or dated records. Each row represents a record at a specific point in time.`;
  }

  // Generic description
  return `Contains ${table.name} records. Each row represents a single ${table.name} entry.`;
}

/**
 * Infer column description from name and type
 */
function inferColumnDescription(table, column) {
  const colName = column.name.toLowerCase();
  const colType = column.type.toLowerCase();

  // ID columns
  if (colName.includes('_id') || colName === 'id') {
    if (column.primaryKey) {
      return `Unique identifier for each ${table.name} record. Primary key.`;
    }
    if (column.foreignKey) {
      return `Foreign key referencing ${column.foreignKey.table}.${column.foreignKey.column}. Links this record to a related record.`;
    }
    return `Identifier for ${table.name} records.`;
  }

  // Date/time columns
  if (
    colName.includes('date') ||
    colName.includes('time') ||
    colName.includes('created') ||
    colName.includes('updated') ||
    colType.includes('date') ||
    colType.includes('time')
  ) {
    if (colName.includes('created')) {
      return `Timestamp when this record was created.`;
    }
    if (colName.includes('updated') || colName.includes('modified')) {
      return `Timestamp when this record was last updated or modified.`;
    }
    return `Date or timestamp value. Used for filtering and sorting by time.`;
  }

  // Status columns
  if (colName.includes('status') || colName.includes('state')) {
    return `Status or state value. Typically used for filtering records by their current state.`;
  }

  // Amount/price columns
  if (
    colName.includes('amount') ||
    colName.includes('price') ||
    colName.includes('cost') ||
    colName.includes('total') ||
    colName.includes('revenue')
  ) {
    return `Numeric value representing an amount, price, or monetary value. Used in aggregations like SUM() and AVG().`;
  }

  // Count/quantity columns
  if (colName.includes('count') || colName.includes('quantity') || colName.includes('qty')) {
    return `Numeric value representing a count or quantity. Used in aggregations.`;
  }

  // Name/title columns
  if (colName.includes('name') || colName.includes('title')) {
    return `Text value representing a name or title. Used for display and filtering.`;
  }

  // Email columns
  if (colName.includes('email')) {
    return `Email address. Used for user identification and communication.`;
  }

  // Generic description
  return `Column of type ${column.type}. ${column.nullable ? 'Can be NULL.' : 'Cannot be NULL.'}`;
}

/**
 * Get usage hints based on column type
 */
function getUsageHints(column, databaseType) {
  const hints = [];
  const colType = column.type.toLowerCase();
  const colName = column.name.toLowerCase();

  // Date columns
  if (colType.includes('date') || colType.includes('time') || colName.includes('date')) {
    if (databaseType === 'clickhouse') {
      hints.push('Use toDate() or toDateTime() for date filtering');
    } else if (databaseType === 'mysql') {
      hints.push('Use DATE() or DATE_FORMAT() for date operations');
    } else if (databaseType === 'postgresql') {
      hints.push('Use DATE_TRUNC() or TO_CHAR() for date operations');
    } else {
      hints.push('Use date functions for filtering and grouping');
    }
  }

  // Numeric columns
  if (
    colType.includes('int') ||
    colType.includes('decimal') ||
    colType.includes('float') ||
    colType.includes('numeric')
  ) {
    if (colName.includes('amount') || colName.includes('price') || colName.includes('total')) {
      hints.push('Use SUM() for totals, AVG() for averages');
    }
  }

  // Text columns
  if (colType.includes('varchar') || colType.includes('text') || colType.includes('string')) {
    hints.push('Use LIKE or = for text filtering');
  }

  return hints;
}

/**
 * Embed schema documentation into RAG API
 * @param {Array<Object>} chunks - Documentation chunks
 * @param {string} userId - User ID for authentication
 * @returns {Promise<void>}
 */
async function embedSchemaDocumentation(chunks, userId) {
  console.log('[Schema Docs RAG] 📤 Starting schema documentation embedding:', {
    userId,
    chunkCount: chunks?.length || 0,
    ragApiUrl: process.env.RAG_API_URL ? 'configured' : 'NOT CONFIGURED',
  });

  if (!process.env.RAG_API_URL) {
    console.log('[Schema Docs RAG] ❌ RAG_API_URL not configured, skipping embedding');
    logger.warn('[Schema Docs RAG] RAG_API_URL not configured, skipping embedding');
    return;
  }

  if (!chunks || chunks.length === 0) {
    console.log('[Schema Docs RAG] ❌ No chunks to embed');
    logger.warn('[Schema Docs RAG] No chunks to embed');
    return;
  }

  const connectionId = chunks[0]?.metadata?.connectionId;
  if (!connectionId) {
    console.log('[Schema Docs RAG] ❌ No connectionId in chunks');
    logger.warn('[Schema Docs RAG] No connectionId in chunks');
    return;
  }

  const jwtToken = generateShortLivedToken(userId);
  const fileId = `schema_doc_${connectionId}`;
  let tempFilePath = null;

  console.log('[Schema Docs RAG] 📝 Preparing to embed:', {
    connectionId,
    fileId,
    chunkCount: chunks.length,
    userId,
  });

  try {
    // Combine all chunks into one document
    // RAG API will automatically chunk it appropriately
    const combinedDoc = chunks.map((chunk) => chunk.text).join('\n\n---\n\n');

    console.log('[Schema Docs RAG] 📄 Combined documentation:', {
      connectionId,
      totalChars: combinedDoc.length,
      chunkCount: chunks.length,
      avgCharsPerChunk: Math.round(combinedDoc.length / chunks.length),
    });

    // Create a temporary text file with all schema documentation
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `${fileId}.txt`);

    // Write combined documentation to temp file
    fs.writeFileSync(tempFilePath, combinedDoc, 'utf8');
    console.log('[Schema Docs RAG] 💾 Created temp file:', { tempFilePath, size: combinedDoc.length });

    // Create FormData for RAG API
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file_id', fileId);
    formData.append('file', fs.createReadStream(tempFilePath));

    // Add metadata for the entire schema documentation
    const metadata = {
      type: 'schema_doc',
      connectionId,
      databaseType: chunks[0]?.metadata?.databaseType,
      tableCount: new Set(chunks.map((c) => c.metadata?.table).filter(Boolean)).size,
    };
    formData.append('storage_metadata', JSON.stringify(metadata));

    const formHeaders = formData.getHeaders();

    // Delete existing schema docs for this connection first
    console.log('[Schema Docs RAG] 🗑️  Deleting existing schema docs (if any):', { connectionId, fileId });
    try {
      await axios.delete(`${process.env.RAG_API_URL}/documents`, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        data: [fileId],
      });
      console.log('[Schema Docs RAG] ✅ Deleted existing schema docs for connection', connectionId);
      logger.debug(`[Schema Docs RAG] Deleted existing schema docs for connection ${connectionId}`);
    } catch (deleteError) {
      // Ignore 404 errors (document doesn't exist yet)
      if (deleteError.response?.status === 404) {
        console.log('[Schema Docs RAG] ℹ️  No existing schema docs to delete (404 - not found)');
      } else {
        console.log('[Schema Docs RAG] ⚠️  Error deleting existing schema docs:', {
          status: deleteError.response?.status,
          message: deleteError.message,
        });
        logger.warn(`[Schema Docs RAG] Error deleting existing schema docs:`, deleteError.message);
      }
    }

    // Embed the combined schema documentation
    console.log('[Schema Docs RAG] 🚀 Sending embedding request to RAG API:', {
      connectionId,
      fileId,
      url: `${process.env.RAG_API_URL}/embed`,
      docSize: combinedDoc.length,
    });

    const embedStartTime = Date.now();
    const response = await axios.post(
      `${process.env.RAG_API_URL}/embed`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          accept: 'application/json',
          ...formHeaders,
        },
        timeout: 300000, // 5 minute timeout for large schemas (OpenRouter can be slow)
      },
    );

    const embedDuration = Date.now() - embedStartTime;

    if (!response.data.status) {
      console.log('[Schema Docs RAG] ❌ Embedding failed - RAG API returned error:', {
        connectionId,
        response: response.data,
      });
      throw new Error(`Embedding failed: ${JSON.stringify(response.data)}`);
    }

    console.log('[Schema Docs RAG] ✅ Successfully embedded schema documentation:', {
      connectionId,
      fileId,
      chunkCount: chunks.length,
      docSize: combinedDoc.length,
      durationMs: embedDuration,
      ragApiResponse: response.data,
    });
    logger.info(
      `[Schema Docs RAG] Embedded schema documentation for connection ${connectionId} (${chunks.length} chunks, ${combinedDoc.length} chars) in ${embedDuration}ms`,
    );
  } catch (error) {
    console.log('[Schema Docs RAG] ❌ Error embedding schema documentation:', {
      connectionId,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
    });
    logAxiosError({
      error,
      message: `Error embedding schema documentation for connection ${connectionId}`,
    });
    throw error;
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        logger.warn(`[Schema Docs RAG] Failed to delete temp file ${tempFilePath}:`, err);
      }
    }
  }
}

/**
 * Query schema documentation from RAG API
 * @param {string} query - User's question
 * @param {string} connectionId - Connection ID to filter by
 * @param {string} userId - User ID for authentication
 * @param {Object} options - Query options
 * @returns {Promise<string>} - Retrieved schema context
 */
async function querySchemaDocumentation(query, connectionId, userId, options = {}) {
  console.log('[Schema Docs RAG] 🔍 Starting schema documentation query:', {
    connectionId,
    userId,
    query: query?.substring(0, 100),
    queryLength: query?.length || 0,
    ragApiUrl: process.env.RAG_API_URL ? 'configured' : 'NOT CONFIGURED',
    options,
  });

  if (!process.env.RAG_API_URL) {
    console.log('[Schema Docs RAG] ⚠️  RAG_API_URL not configured, skipping query');
    logger.debug('[Schema Docs RAG] RAG_API_URL not configured, skipping query');
    return '';
  }

  if (!query || !connectionId || !userId) {
    console.log('[Schema Docs RAG] ⚠️  Missing required parameters:', {
      hasQuery: !!query,
      hasConnectionId: !!connectionId,
      hasUserId: !!userId,
    });
    logger.debug('[Schema Docs RAG] Missing required parameters for query');
    return '';
  }

  const { k = 5 } = options;
  const jwtToken = generateShortLivedToken(userId);
  const fileId = `schema_doc_${connectionId}`;

  console.log('[Schema Docs RAG] 📋 Query parameters:', {
    connectionId,
    fileId,
    query: query.substring(0, 150),
    k,
    url: `${process.env.RAG_API_URL}/query`,
  });

  try {
    // Query RAG API using the schema documentation file_id
    const queryStartTime = Date.now();
    const response = await axios.post(
      `${process.env.RAG_API_URL}/query`,
      {
        file_id: fileId,
        query: query,
        k: k,
      },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      },
    );
    const queryDuration = Date.now() - queryStartTime;

    console.log('[Schema Docs RAG] 📥 RAG API query response:', {
      connectionId,
      fileId,
      status: response.status,
      hasData: !!response.data,
      dataType: Array.isArray(response.data) ? 'array' : typeof response.data,
      dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
      durationMs: queryDuration,
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      console.log('[Schema Docs RAG] ⚠️  No results found from RAG API:', {
        connectionId,
        fileId,
        responseData: response.data,
      });
      logger.debug(`[Schema Docs RAG] No results found for connection ${connectionId}`);
      return '';
    }

    // Format the results into a context string
    const contextItems = response.data
      .map((item, index) => {
        const pageContent = item[0]?.page_content || item.page_content || '';
        return pageContent.trim();
      })
      .filter((content) => content.length > 0)
      .join('\n\n---\n\n');

    console.log('[Schema Docs RAG] 📊 Processing query results:', {
      connectionId,
      rawResultsCount: response.data.length,
      validContextItems: contextItems.split('\n\n---\n\n').length,
      totalContextLength: contextItems.length,
      firstItemPreview: response.data[0] ? JSON.stringify(response.data[0]).substring(0, 200) : 'N/A',
    });

    if (contextItems.length === 0) {
      console.log('[Schema Docs RAG] ⚠️  No valid context extracted:', {
        connectionId,
        rawResultsCount: response.data.length,
      });
      logger.debug(`[Schema Docs RAG] No valid context extracted for connection ${connectionId}`);
      return '';
    }

    const finalContext = `Schema Documentation Context:\n${contextItems}`;
    console.log('[Schema Docs RAG] ✅ Successfully retrieved schema documentation context:', {
      connectionId,
      chunkCount: response.data.length,
      contextLength: finalContext.length,
      contextPreview: finalContext.substring(0, 300),
      durationMs: queryDuration,
    });
    logger.debug(
      `[Schema Docs RAG] Retrieved ${response.data.length} schema documentation chunks for connection ${connectionId} in ${queryDuration}ms`,
    );

    return finalContext;
  } catch (error) {
    // If document doesn't exist (404), that's okay - schema docs might not be embedded yet
    if (error.response?.status === 404) {
      console.log('[Schema Docs RAG] ⚠️  Schema documentation not found (404):', {
        connectionId,
        fileId,
        message: 'Schema docs may not be embedded yet. This is normal on first query after schema extraction.',
      });
      logger.debug(`[Schema Docs RAG] Schema documentation not found for connection ${connectionId} (not embedded yet)`);
      return '';
    }

    console.log('[Schema Docs RAG] ❌ Error querying schema documentation:', {
      connectionId,
      fileId,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
    });
    logAxiosError({
      error,
      message: `Error querying schema documentation for connection ${connectionId}`,
    });
    return '';
  }
}

/**
 * Delete schema documentation for a connection
 * @param {string} connectionId - Connection ID
 * @param {string} userId - User ID for authentication
 * @returns {Promise<void>}
 */
async function deleteSchemaDocumentation(connectionId, userId) {
  console.log('[Schema Docs RAG] 🗑️  Starting schema documentation deletion:', {
    connectionId,
    userId,
    ragApiUrl: process.env.RAG_API_URL ? 'configured' : 'NOT CONFIGURED',
  });

  if (!process.env.RAG_API_URL) {
    console.log('[Schema Docs RAG] ⚠️  RAG_API_URL not configured, skipping deletion');
    logger.debug('[Schema Docs RAG] RAG_API_URL not configured, skipping deletion');
    return;
  }

  if (!connectionId || !userId) {
    console.log('[Schema Docs RAG] ⚠️  Missing required parameters:', {
      hasConnectionId: !!connectionId,
      hasUserId: !!userId,
    });
    logger.debug('[Schema Docs RAG] Missing required parameters for deletion');
    return;
  }

  const jwtToken = generateShortLivedToken(userId);
  const fileId = `schema_doc_${connectionId}`;

  console.log('[Schema Docs RAG] 📋 Delete parameters:', {
    connectionId,
    fileId,
    url: `${process.env.RAG_API_URL}/documents`,
  });

  try {
    await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      data: [fileId],
    });

    console.log('[Schema Docs RAG] ✅ Successfully deleted schema documentation:', {
      connectionId,
      fileId,
    });
    logger.info(`[Schema Docs RAG] Deleted schema documentation for connection ${connectionId}`);
  } catch (error) {
    // Ignore 404 errors (document doesn't exist)
    if (error.response?.status === 404) {
      console.log('[Schema Docs RAG] ℹ️  Schema documentation not found (404 - already deleted or never existed):', {
        connectionId,
        fileId,
      });
      logger.debug(`[Schema Docs RAG] Schema documentation not found for connection ${connectionId} (already deleted or never existed)`);
      return;
    }

    console.log('[Schema Docs RAG] ❌ Error deleting schema documentation:', {
      connectionId,
      fileId,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
    });
    logAxiosError({
      error,
      message: `Error deleting schema documentation for connection ${connectionId}`,
    });
    throw error;
  }
}

module.exports = {
  generateSchemaDocumentation,
  embedSchemaDocumentation,
  querySchemaDocumentation,
  deleteSchemaDocumentation,
};
