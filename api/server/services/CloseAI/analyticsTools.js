const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');
const mongoose = require('mongoose');
const { DatabaseConnection } = require('~/db/models');
const { decryptCredentials } = require('~/server/services/Analytics/encryption');
const { generateSqlQuery } = require('~/server/services/Analytics/queryGenerator');
const { executeQuery } = require('~/server/services/Analytics/queryExecutor');
const {
  extractSchema,
  storeTableEmbeddingsForConnection,
  formatSchemaForPrompt,
} = require('~/server/services/Analytics/connectionService');
const subscriptionService = require('~/server/services/SubscriptionService');
const {
  getSampleDbWithCredentials,
  extractSampleDbSchema,
} = require('~/server/services/Analytics/sampleDbService');

/**
 * Analytics Tools for Agent-Based Processing
 * These tools allow an agent to orchestrate database analytics operations
 */

// Cache for storing table data between tool calls (avoids passing large JSON through LLM)
const tablesCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function setTablesCache(connectionId, tables) {
  tablesCache.set(connectionId, {
    tables,
    timestamp: Date.now(),
  });
}

function getTablesCache(connectionId) {
  const cached = tablesCache.get(connectionId);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    tablesCache.delete(connectionId);
    return null;
  }

  return cached.tables;
}

/**
 * Get database connection by ID
 */
const getDbConnectionTool = new DynamicStructuredTool({
  name: 'get_db_connection',
  description: `Retrieves a database connection by its ID. Returns connection details including type, host, port, database name, and credentials.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".
Example: { "connectionId": "abc123" }`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
  }),
  func: async ({ connectionId }) => {
    try {
      logger.info('[Analytics Tool] get_db_connection called:', { connectionId });

      // Handle sample database case
      if (connectionId === 'sample-db') {
        const sampleDb = getSampleDbWithCredentials();
        return JSON.stringify({
          success: true,
          connection: {
            id: 'sample-db',
            type: sampleDb.type,
            host: sampleDb.host,
            port: sampleDb.port,
            database: sampleDb.database,
            username: sampleDb.username,
            isActive: true,
            queryMode: 'read_only',
            hasPassword: !!sampleDb.password,
            hasSslCertificate: false,
          },
        });
      }

      const connection = await DatabaseConnection.findById(connectionId).select(
        '+password +sslCertificate',
      );

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      if (!connection.isActive) {
        return JSON.stringify({ success: false, error: 'Database connection is inactive' });
      }

      return JSON.stringify({
        success: true,
        connection: {
          id: connection._id.toString(),
          type: connection.type,
          host: connection.host,
          port: connection.port,
          database: connection.database,
          username: connection.username,
          isActive: connection.isActive,
          queryMode: connection.queryMode,
          hasPassword: !!connection.password,
          hasSslCertificate: !!connection.sslCertificate,
        },
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in get_db_connection:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Check if schema is cached and still valid
 */
const checkSchemaCacheTool = new DynamicStructuredTool({
  name: 'check_schema_cache',
  description: `Checks if a database schema is cached and whether it is still valid (not older than 24 hours). Returns cache status and age.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
  }),
  func: async ({ connectionId }) => {
    try {
      logger.info('[Analytics Tool] check_schema_cache called:', { connectionId });

      // Handle sample database case - check in-memory cache
      if (connectionId === 'sample-db') {
        const {
          getSampleDbSchemaCacheStatus,
        } = require('~/server/services/Analytics/sampleDbService');
        const cacheStatus = getSampleDbSchemaCacheStatus();

        if (cacheStatus.isValid) {
          return JSON.stringify({
            success: true,
            cached: true,
            needsRefresh: false,
            schemaAgeMs: cacheStatus.ageMs,
            schemaAgeHours: (cacheStatus.ageMs / (60 * 60 * 1000)).toFixed(2),
            message: `Sample DB schema cached and valid (${(cacheStatus.ageMs / (60 * 60 * 1000)).toFixed(2)} hours old)`,
          });
        }

        return JSON.stringify({
          success: true,
          cached: false,
          needsRefresh: true,
          message: cacheStatus.hasSchema
            ? 'Sample database schema cache expired'
            : 'Sample database schema is not cached',
        });
      }

      const connection = await DatabaseConnection.findById(connectionId);

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const schema = connection.cachedSchema;
      const schemaCachedAt = connection.schemaCachedAt;

      if (!schema || !schemaCachedAt) {
        return JSON.stringify({
          success: true,
          cached: false,
          needsRefresh: true,
          message: 'Schema is not cached',
        });
      }

      const schemaAge = Date.now() - schemaCachedAt.getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const needsRefresh = schemaAge > maxAge;

      return JSON.stringify({
        success: true,
        cached: true,
        needsRefresh,
        schemaAgeMs: schemaAge,
        schemaAgeHours: (schemaAge / (60 * 60 * 1000)).toFixed(2),
        cachedAt: schemaCachedAt.toISOString(),
        message: needsRefresh
          ? `Schema is cached but expired (${(schemaAge / (60 * 60 * 1000)).toFixed(2)} hours old)`
          : `Schema is cached and valid (${(schemaAge / (60 * 60 * 1000)).toFixed(2)} hours old)`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in check_schema_cache:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Extract schema from database
 */
const extractSchemaTool = new DynamicStructuredTool({
  name: 'extract_schema',
  description: `Extracts the database schema (tables, columns, types) from a database connection. This operation may take some time.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
  }),
  func: async ({ connectionId }) => {
    try {
      logger.info('[Analytics Tool] extract_schema called:', { connectionId });

      // Handle sample database case
      if (connectionId === 'sample-db') {
        const schema = await extractSampleDbSchema();
        return JSON.stringify({
          success: true,
          schema,
          message: `Schema extracted successfully. Found ${schema?.tables?.length || 0} tables.`,
        });
      }

      const connection = await DatabaseConnection.findById(connectionId).select(
        '+password +sslCertificate',
      );

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const decryptedPassword = decryptCredentials(connection.password);

      const schema = await extractSchema({
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: decryptedPassword,
        ssl: connection.ssl,
        sslCertificate: connection.sslCertificate
          ? decryptCredentials(connection.sslCertificate)
          : undefined,
      });

      // Store table name embeddings for hybrid RAG (fire and forget)
      if (schema?.tables?.length > 0) {
        storeTableEmbeddingsForConnection(connectionId, schema).catch((err) => {
          logger.debug('[Analytics Tool] Failed to store table embeddings:', err.message);
        });
      }

      return JSON.stringify({
        success: true,
        schema,
        message: `Schema extracted successfully. Found ${schema?.tables?.length || 0} tables.`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in extract_schema:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Cache schema to database connection
 */
const cacheSchemaTool = new DynamicStructuredTool({
  name: 'cache_schema',
  description: `Caches a database schema to the connection record for faster future access. Schema is valid for 24 hours.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
    schema: z.any().describe('The schema object to cache (from extract_schema tool)'),
  }),
  func: async ({ connectionId, schema }) => {
    try {
      logger.info('[Analytics Tool] cache_schema called:', { connectionId });

      // Handle sample database case - no caching for sample DB
      if (connectionId === 'sample-db') {
        return JSON.stringify({
          success: true,
          message: 'Sample database schema caching skipped',
        });
      }

      const connection = await DatabaseConnection.findById(connectionId);

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      // Parse schema if it's a string
      const schemaObj = typeof schema === 'string' ? JSON.parse(schema) : schema;

      connection.cachedSchema = schemaObj;
      connection.schemaCachedAt = new Date();
      await connection.save();

      // Store table name embeddings for hybrid RAG (fire and forget)
      if (schemaObj?.tables?.length > 0) {
        storeTableEmbeddingsForConnection(connectionId, schemaObj).catch((err) => {
          logger.debug('[Analytics Tool] Failed to store table embeddings:', err.message);
        });
      }

      return JSON.stringify({
        success: true,
        message: 'Schema cached successfully',
        cachedAt: connection.schemaCachedAt.toISOString(),
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in cache_schema:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Generate SQL query from natural language question
 */
const generateSqlQueryTool = new DynamicStructuredTool({
  name: 'generate_sql_query',
  description: `Generates a SQL query from a natural language question using an LLM. Requires the database schema and question.
IMPORTANT: 
- Use parameter name "connectionId" (camelCase), NOT "connection_id"
- ALWAYS provide the analyticsModel parameter (e.g., "xiaomi/mimo-v2-flash" or "moonshotai/kimi-k2.5")`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
    question: z.string().describe('The natural language question to convert to SQL'),
    schema: z
      .any()
      .nullable()
      .optional()
      .describe('The database schema (optional if already cached)'),
    analyticsModel: z
      .string()
      .describe(
        'REQUIRED: The LLM model to use for SQL generation (e.g.,"moonshotai/kimi-k2.5", "xiaomi/mimo-v2-flash")',
      ),
    userId: z.string().nullable().optional().describe('User ID for retrieving relevant skills'),
    originalQuestion: z
      .string()
      .nullable()
      .optional()
      .describe('Original user question for skill matching (without tool call context)'),
  }),
  func: async ({ connectionId, question, schema, analyticsModel, userId, originalQuestion }) => {
    try {
      logger.info('[Analytics Tool] generate_sql_query called:', {
        connectionId,
        question: question?.substring(0, 100),
        analyticsModel: analyticsModel || 'NOT PROVIDED',
      });

      // Handle sample database case
      let connection;
      if (connectionId === 'sample-db') {
        connection = getSampleDbWithCredentials();
      }

      // If schema not provided, try to get from cache
      let schemaToUse = schema;
      if (!schemaToUse && connectionId !== 'sample-db') {
        const dbConnection = await DatabaseConnection.findById(connectionId);
        if (dbConnection?.cachedSchema) {
          schemaToUse = dbConnection.cachedSchema;
        }
      }

      // Parse schema if it's a string
      if (typeof schemaToUse === 'string') {
        try {
          schemaToUse = JSON.parse(schemaToUse);
        } catch {
          // If parsing fails, schemaToUse remains as string
        }
      }

      if (!schemaToUse) {
        return JSON.stringify({
          success: false,
          error: 'Schema is required. Please extract schema first using extract_schema tool.',
        });
      }

      if (!connection) {
        connection = await DatabaseConnection.findById(connectionId);
      }
      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const selectedModelForLLM =
        analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';

      const result = await generateSqlQuery({
        question,
        schema: schemaToUse,
        databaseType: connection.type,
        queryMode: connection.queryMode || 'read_only',
        model: selectedModelForLLM,
        userId,
        originalQuestion, // Pass original question for skill matching
        connectionId, // Pass connectionId for schema documentation retrieval
      });

      if (!result.sql) {
        return JSON.stringify({
          success: false,
          error: result.explanation || 'Failed to generate SQL query',
          explanation: result.explanation,
        });
      }

      return JSON.stringify({
        success: true,
        sql: result.sql,
        explanation: result.explanation,
        tokensUsed: result.tokensUsed,
        message: 'SQL query generated successfully',
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in generate_sql_query:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Execute SQL query on database
 */
const executeSqlQueryTool = new DynamicStructuredTool({
  name: 'execute_sql_query',
  description: `Executes a SQL query on the database and returns the results. Handles errors gracefully.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
    sql: z.string().describe('The SQL query to execute'),
  }),
  func: async ({ connectionId, sql }) => {
    try {
      logger.info('[Analytics Tool] execute_sql_query called:', {
        connectionId,
        sql: sql?.substring(0, 100),
      });

      let connection;
      let password;

      // Handle sample database case
      if (connectionId === 'sample-db') {
        connection = getSampleDbWithCredentials();
        // Use password directly (not encrypted for sample DB)
        password = connection.password;
      } else {
        connection = await DatabaseConnection.findById(connectionId).select(
          '+password +sslCertificate',
        );
        if (!connection) {
          return JSON.stringify({ success: false, error: 'Database connection not found' });
        }
        password = decryptCredentials(connection.password);
      }

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const queryResult = await executeQuery({
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: password,
        ssl: connection.ssl,
        sslCertificate: connection.sslCertificate
          ? decryptCredentials(connection.sslCertificate)
          : undefined,
        sql,
        queryMode: connection.queryMode || 'read_only',
        timeout: 30000,
        maxRows: 1000,
      });

      return JSON.stringify({
        success: true,
        results: {
          columns: queryResult.columns,
          rows: queryResult.rows,
          rowCount: queryResult.rowCount,
          executionTimeMs: queryResult.executionTimeMs,
          truncated: queryResult.truncated,
          suggestedChartType: queryResult.suggestedChartType,
        },
        message: `Query executed successfully. Returned ${queryResult.rowCount} rows in ${(queryResult.executionTimeMs / 1000).toFixed(2)}s`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in execute_sql_query:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to execute SQL query',
      });
    }
  },
});

/**
 * Format query results as markdown text
 */
const formatResultsTool = new DynamicStructuredTool({
  name: 'format_results',
  description:
    'Formats SQL query results, explanation, and SQL query into a readable markdown text response.',
  schema: z.object({
    explanation: z
      .string()
      .nullable()
      .optional()
      .describe('The explanation of what the query does'),
    sql: z.string().describe('The SQL query that was executed'),
    results: z.any().describe('The query results object from execute_sql_query'),
  }),
  func: async ({ explanation, sql, results }) => {
    try {
      logger.info('[Analytics Tool] format_results called');

      // Parse results if it's a string
      const resultsObj = typeof results === 'string' ? JSON.parse(results) : results;

      let responseText = '';

      // Add explanation if available
      if (explanation) {
        responseText += `${explanation}\n\n`;
      }

      // Add the generated SQL query
      if (sql) {
        responseText += `**Generated SQL Query:**\n\`\`\`sql\n${sql}\n\`\`\`\n\n`;
      }

      // Add query results
      if (resultsObj?.columns && resultsObj.columns.length > 0) {
        responseText += `**Query Results:**\n\n`;

        // Format as table
        const headers = resultsObj.columns.map((col) => col.name).join(' | ');
        responseText += `| ${headers} |\n`;
        responseText += `|${resultsObj.columns.map(() => '---').join('|')}|\n`;

        resultsObj.rows.slice(0, 50).forEach((row) => {
          const values = resultsObj.columns
            .map((col) => {
              const value = row[col.name];
              return value !== null && value !== undefined ? String(value) : 'NULL';
            })
            .join(' | ');
          responseText += `| ${values} |\n`;
        });

        if (resultsObj.rowCount > 50) {
          responseText += `\n*Showing first 50 of ${resultsObj.rowCount} rows${resultsObj.truncated ? ' (truncated)' : ''}*\n`;
        } else if (resultsObj.truncated) {
          responseText += `\n*Results truncated at ${resultsObj.rowCount} rows*\n`;
        }

        if (resultsObj.executionTimeMs) {
          responseText += `\n*Query executed in ${(resultsObj.executionTimeMs / 1000).toFixed(2)}s*\n`;
        }
      } else {
        responseText += 'Query executed successfully (no results returned).';
      }

      return JSON.stringify({
        success: true,
        formattedText: responseText,
        message: 'Results formatted successfully',
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in format_results:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Increment query count for user
 */
const incrementQueryCountTool = new DynamicStructuredTool({
  name: 'increment_query_count',
  description:
    'Increments the query count for the user who owns the database connection. Used for usage tracking.',
  schema: z.object({
    connectionId: z.string().describe('The MongoDB ObjectId of the database connection'),
    userId: z
      .string()
      .optional()
      .describe('The user ID of the user performing the query (optional)'),
  }),
  func: async ({ connectionId, userId: userIdParam }) => {
    try {
      logger.info('[Analytics Tool] increment_query_count called:', { connectionId, userIdParam });

      let userId = userIdParam;

      if (!userId) {
        // Skip ownership check for sample database
        if (connectionId === 'sample-db') {
          return JSON.stringify({
            success: true,
            message: 'Query count increment skipped for sample database',
          });
        }
        const connection = await DatabaseConnection.findById(connectionId);
        if (!connection) {
          return JSON.stringify({ success: false, error: 'Database connection not found' });
        }
        userId = connection.createdBy?.toString() || connection.createdBy;
      }

      if (!userId) {
        return JSON.stringify({
          success: false,
          error: 'No userId found in parameter or connection.createdBy',
        });
      }

      await subscriptionService.incrementQueryCount(userId);

      return JSON.stringify({
        success: true,
        message: `Query count incremented for user ${userId}`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in increment_query_count:', error);
      // Don't fail the request if usage tracking fails
      return JSON.stringify({
        success: false,
        error: error.message,
        warning: 'Usage tracking failed but query was successful',
      });
    }
  },
});

/**
 * List available tables (compact version for table selection)
 * Returns table names and column names only - no full schema details
 * This is ~95% smaller than full schema, saving ~75k+ tokens
 */
const listAvailableTablesTool = new DynamicStructuredTool({
  name: 'list_available_tables',
  description: `Lists all available tables in the database with their column names. Returns a COMPACT summary (table names + column names only) instead of full schema details. Use this BEFORE selecting relevant tables to avoid loading the entire 80k+ token schema.
IMPORTANT: Use parameter name "connectionId" (camelCase), NOT "connection_id".`,
  schema: z.object({
    connectionId: z
      .string()
      .describe('The MongoDB ObjectId of the database connection (use camelCase: connectionId)'),
  }),
  func: async ({ connectionId }) => {
    try {
      logger.info('[Analytics Tool] list_available_tables called:', { connectionId });

      let connection;
      if (connectionId === 'sample-db') {
        connection = getSampleDbWithCredentials();
      } else {
        connection = await DatabaseConnection.findById(connectionId).select(
          '+password +sslCertificate',
        );
      }

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const decryptedPassword =
        connectionId === 'sample-db'
          ? connection.password
          : decryptCredentials(connection.password);

      const schema = await extractSchema({
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: decryptedPassword,
        ssl: connection.ssl,
        sslCertificate: connection.sslCertificate
          ? connectionId === 'sample-db'
            ? connection.sslCertificate
            : decryptCredentials(connection.sslCertificate)
          : undefined,
      });

      if (!schema || !schema.tables) {
        return JSON.stringify({ success: false, error: 'No tables found in database' });
      }

      const compactTables = schema.tables.map((table) => ({
        name: table.name,
        rowCount: table.rowCount,
        columns: table.columns.map((col) => col.name),
      }));

      // Store in cache for select_relevant_tables to use
      setTablesCache(connectionId, compactTables);

      // Return concise response - tables are cached, no need to return all names
      // This saves significant tokens in LLM context
      return JSON.stringify({
        success: true,
        connectionId: connectionId,
        totalTables: compactTables.length,
        message: `Found ${compactTables.length} tables. Tables cached for selection. Use select_relevant_tables with connectionId "${connectionId}" and the user question to select relevant tables.`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in list_available_tables:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Select relevant tables using LLM
 * Uses cached tables from list_available_tables, no need to pass tables parameter
 */
const selectRelevantTablesTool = new DynamicStructuredTool({
  name: 'select_relevant_tables',
  description: `Selects relevant tables from the available tables based on the user's question. Uses LLM reasoning to pick only tables needed for the query. Returns table NAMES only (not schema).
IMPORTANT: 
- Use the SAME connectionId from list_available_tables (tables are cached by connectionId)
- Always provide the userQuestion parameter
- This tool retrieves tables from cache, no need to pass tables parameter`,
  schema: z.object({
    connectionId: z
      .string()
      .describe(
        'The MongoDB ObjectId of the database connection (same as used in list_available_tables)',
      ),
    userQuestion: z.string().describe("The user's question to determine relevant tables"),
    maxTables: z
      .number()
      .nullable()
      .optional()
      .describe('Maximum number of tables to select (default: 10)'),
  }),
  func: async ({ connectionId, userQuestion, maxTables }) => {
    try {
      const maxTablesValue = maxTables ?? 10;

      // Get tables from cache
      const tables = getTablesCache(connectionId);

      if (!tables || tables.length === 0) {
        return JSON.stringify({
          success: false,
          error:
            'Tables not found in cache. Please call list_available_tables first with the same connectionId.',
        });
      }

      logger.info('[Analytics Tool] select_relevant_tables called:', {
        connectionId,
        tablesCount: tables.length,
        questionPreview: userQuestion?.substring(0, 50),
        maxTablesValue,
      });

      if (tables.length <= maxTablesValue) {
        const tableNames = tables.map((t) => t.name);
        return JSON.stringify({
          success: true,
          selectedTables: tableNames,
          message: `All ${tableNames.length} tables selected (total is within limit).`,
        });
      }

      const { ChatOpenAI } = require('@langchain/openai');

      const tableSummary = tables
        .map((t, idx) => {
          const cols = t.columns?.slice(0, 30)?.join(', ') || 'no columns';
          const moreCols = t.columns?.length > 30 ? ` (+${t.columns.length - 30} more)` : '';
          const rows = t.rowCount ? ` (~${t.rowCount.toLocaleString()} rows)` : '';
          return `${idx + 1}. ${t.name}${rows}: ${cols}${moreCols}`;
        })
        .join('\n');

      const selectionPrompt = `You are a database expert. Select ONLY the tables relevant to answer the user's question.

USER QUESTION: ${userQuestion}

AVAILABLE TABLES (${tables.length} total):
${tableSummary}

INSTRUCTIONS:
1. Analyze the question to understand what data is needed
2. Select tables that contain relevant columns for the query
3. Include related tables if joins are likely needed (fact tables with dimension tables)
4. Be conservative - select only what's truly needed (typically 3-${maxTablesValue} tables)
5. If the user asks about "all tables", "list tables", or metadata questions, respond with "ALL"

Respond with ONLY a comma-separated list of table names (exact names from the list above).
Example: orders, customers, order_items

SELECTED TABLES:`;

      const modelName = process.env.ANALYTICS_SCHEMA_FILTER_MODEL || 'xiaomi/mimo-v2-flash';
      const isOpenRouter = modelName.includes('/');

      const llm = new ChatOpenAI({
        modelName,
        temperature: 0.1,
        maxTokens: 500,
        ...(isOpenRouter && {
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
          },
        }),
      });

      const response = await llm.invoke([{ role: 'user', content: selectionPrompt }]);
      const content = response.content?.trim() || '';

      logger.info('[Analytics Tool] LLM table selection response:', {
        responseLength: content.length,
        responsePreview: content.substring(0, 200),
      });

      const upperContent = content.toUpperCase();
      if (upperContent === 'ALL' || upperContent.includes('ALL TABLES')) {
        const allTables = tables.map((t) => t.name).slice(0, maxTablesValue);
        return JSON.stringify({
          success: true,
          selectedTables: allTables,
          message: `Selected all ${allTables.length} tables (limited to maxTables).`,
        });
      }

      const tableNames = content
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      const validTables = [];

      for (const name of tableNames) {
        const lowerName = name.toLowerCase();
        const exactMatch = tables.find((t) => t.name.toLowerCase() === lowerName);
        if (exactMatch) {
          validTables.push(exactMatch.name);
        } else {
          const partialMatch = tables.find(
            (t) =>
              t.name.toLowerCase().includes(lowerName) || lowerName.includes(t.name.toLowerCase()),
          );
          if (partialMatch && !validTables.includes(partialMatch.name)) {
            validTables.push(partialMatch.name);
          }
        }
      }

      const selectedTables = [...new Set(validTables)].slice(0, maxTablesValue);

      if (selectedTables.length === 0) {
        const keywordTables = selectTablesByKeywords(tables, userQuestion, maxTablesValue);
        return JSON.stringify({
          success: true,
          selectedTables: keywordTables,
          message: `Used keyword matching to select ${keywordTables.length} tables.`,
        });
      }

      return JSON.stringify({
        success: true,
        selectedTables,
        message: `Selected ${selectedTables.length} relevant tables: ${selectedTables.join(', ')}`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in select_relevant_tables:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

function selectTablesByKeywords(tables, question, maxTables) {
  const questionLower = question.toLowerCase();
  const words = questionLower.split(/\s+/).filter((w) => w.length > 2);

  const tableScores = tables.map((table) => {
    let score = 0;
    const tableLower = table.name.toLowerCase();
    const colsLower = (table.columns || []).join(' ').toLowerCase();
    const combined = tableLower + ' ' + colsLower;

    for (const word of words) {
      if (combined.includes(word)) score += 1;
      if (tableLower.includes(word)) score += 2;
    }

    return { name: table.name, score };
  });

  tableScores.sort((a, b) => b.score - a.score);
  return tableScores
    .filter((t) => t.score > 0)
    .slice(0, maxTables)
    .map((t) => t.name);
}

/**
 * Extract schema for specific tables only
 * Returns full schema details ONLY for the selected tables
 */
const extractSchemaForTablesTool = new DynamicStructuredTool({
  name: 'extract_schema_for_tables',
  description: `Extracts the FULL schema (columns, types, foreign keys, sample data) for ONLY the specified tables. Use this AFTER selecting relevant tables to get detailed schema for query generation.
IMPORTANT: 
- Use parameter name "connectionId" (camelCase), NOT "connection_id"
- Pass the selectedTables array from select_relevant_tables
- This returns much less data than extract_schema (only selected tables)`,
  schema: z.object({
    connectionId: z.string().describe('The MongoDB ObjectId of the database connection'),
    selectedTables: z.array(z.string()).describe('Array of table names to extract schema for'),
  }),
  func: async ({ connectionId, selectedTables }) => {
    try {
      logger.info('[Analytics Tool] extract_schema_for_tables called:', {
        connectionId,
        selectedTablesCount: selectedTables?.length || 0,
        tables: selectedTables,
      });

      if (!selectedTables || selectedTables.length === 0) {
        return JSON.stringify({ success: false, error: 'No tables specified' });
      }

      let connection;
      if (connectionId === 'sample-db') {
        connection = getSampleDbWithCredentials();
      } else {
        connection = await DatabaseConnection.findById(connectionId).select(
          '+password +sslCertificate',
        );
      }

      if (!connection) {
        return JSON.stringify({ success: false, error: 'Database connection not found' });
      }

      const decryptedPassword =
        connectionId === 'sample-db'
          ? connection.password
          : decryptCredentials(connection.password);

      const fullSchema = await extractSchema({
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: decryptedPassword,
        ssl: connection.ssl,
        sslCertificate: connection.sslCertificate
          ? connectionId === 'sample-db'
            ? connection.sslCertificate
            : decryptCredentials(connection.sslCertificate)
          : undefined,
      });

      if (!fullSchema || !fullSchema.tables) {
        return JSON.stringify({ success: false, error: 'Failed to extract schema' });
      }

      const selectedTablesLower = selectedTables.map((t) => t.toLowerCase());
      const filteredTables = fullSchema.tables.filter((table) =>
        selectedTablesLower.includes(table.name.toLowerCase()),
      );

      // Simplify schema - remove nullable and primaryKey to reduce tokens
      const simplifiedTables = filteredTables.map((table) => ({
        name: table.name,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          ...(col.primaryKey && { primaryKey: true }),
          ...(col.foreignKey && { foreignKey: col.foreignKey }),
        })),
        ...(table.rowCount && { rowCount: table.rowCount }),
      }));

      const filteredSchema = {
        tables: simplifiedTables,
        _filtered: true,
        _originalTableCount: fullSchema.tables.length,
        _selectedTableCount: simplifiedTables.length,
      };

      const schemaText = formatSchemaForPrompt(filteredSchema);
      const estimatedTokens = Math.ceil(schemaText.length / 4);

      return JSON.stringify({
        success: true,
        schema: filteredSchema,
        tablesCount: filteredTables.length,
        originalTablesCount: fullSchema.tables.length,
        estimatedTokens,
        message: `Extracted schema for ${filteredTables.length} tables (reduced from ${fullSchema.tables.length} total). ~${estimatedTokens} tokens.`,
      });
    } catch (error) {
      logger.error('[Analytics Tool] Error in extract_schema_for_tables:', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

/**
 * Get all analytics tools
 */
function getAnalyticsTools() {
  return [
    getDbConnectionTool,
    checkSchemaCacheTool,
    extractSchemaTool,
    cacheSchemaTool,
    generateSqlQueryTool,
    executeSqlQueryTool,
    formatResultsTool,
    incrementQueryCountTool,
    listAvailableTablesTool,
    selectRelevantTablesTool,
    extractSchemaForTablesTool,
  ];
}

module.exports = {
  getAnalyticsTools,
  getDbConnectionTool,
  checkSchemaCacheTool,
  extractSchemaTool,
  cacheSchemaTool,
  generateSqlQueryTool,
  executeSqlQueryTool,
  formatResultsTool,
  incrementQueryCountTool,
  listAvailableTablesTool,
  selectRelevantTablesTool,
  extractSchemaForTablesTool,
};
