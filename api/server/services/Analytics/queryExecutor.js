const { logger } = require('@librechat/data-schemas');
const connectorFactory = require('./connectors');
const { extractDatabaseError } = require('./DatabaseError');

/**
 * Validate SQL query for safety before execution
 * @param {string} sql - SQL query to validate
 * @param {string} queryMode - Query mode (read_only, read_write)
 * @returns {Object} - { valid, reason }
 */
function validateQuerySafety(sql, queryMode) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, reason: 'Invalid SQL query' };
  }

  const upperSql = sql.toUpperCase().trim();

  // Always block dangerous operations regardless of mode
  const dangerousPatterns = [
    /DROP\s+DATABASE/i,
    /DROP\s+SCHEMA/i,
    /TRUNCATE\s+TABLE/i,
    /DELETE\s+FROM\s+\w+\s*;?\s*$/i, // DELETE without WHERE
    /;\s*DROP/i, // SQL injection attempt
    /;\s*DELETE/i, // SQL injection attempt
    /;\s*UPDATE/i, // SQL injection attempt
    /GRANT\s+/i,
    /REVOKE\s+/i,
    /CREATE\s+USER/i,
    /ALTER\s+USER/i,
    /DROP\s+USER/i,
    /LOAD\s+DATA/i,
    /INTO\s+OUTFILE/i,
    /INTO\s+DUMPFILE/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      return { valid: false, reason: 'Query contains potentially dangerous operation' };
    }
  }

  // In read-only mode, only allow safe read operations
  if (queryMode === 'read_only') {
    const allowedPrefixes = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'PRAGMA'];
    const isAllowed = allowedPrefixes.some((prefix) => upperSql.startsWith(prefix));

    if (!isAllowed) {
      return {
        valid: false,
        reason: 'Only SELECT and read-only queries are allowed in read-only mode',
      };
    }

    // Check for data-modifying operations (not SELECT WITH CTEs)
    // Allow CTEs (WITH clauses) that contain SELECT, but block modifying CTEs
    const modifyingStatements = ['INSERT\s+', 'UPDATE\s+', 'DELETE\s+'];
    for (const pattern of modifyingStatements) {
      if (new RegExp(`\\b${pattern}`, 'i').test(sql)) {
        return {
          valid: false,
          reason: 'Data modification operations are not allowed in read-only mode',
        };
      }
    }

    // Block DDL operations that change schema
    const ddlPatterns = [
      /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)/i,
      /\bCREATE\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)/i,
      /\bALTER\s+(TABLE|DATABASE|SCHEMA)/i,
      /\bTRUNCATE\s+TABLE/i,
    ];
    for (const pattern of ddlPatterns) {
      if (pattern.test(sql)) {
        return {
          valid: false,
          reason: 'Schema modification operations are not allowed in read-only mode',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Executes a SQL query against a database
 * @param {Object|any} configOrParams - Connection configuration or full parameters object
 * @param {string} [sqlParam] - SQL query to execute (if configOrParams is just config)
 * @returns {Promise<Object>} - Query results
 */
async function executeQuery(configOrParams, sqlParam) {
  // Ultra-robust argument handling
  let sql, config;

  if (sqlParam && typeof sqlParam === 'string') {
    // Two-argument call: (config, sql)
    config = configOrParams;
    sql = sqlParam;
  } else if (configOrParams && typeof configOrParams === 'object') {
    // Single-argument call: ({ ...config, sql }) or connection model
    config = configOrParams;
    sql = configOrParams.sql || (typeof configOrParams.toObject === 'function' ? configOrParams.toObject().sql : null);
  }

  const { type, queryMode = 'read_only', queryTimeout, maxRows } = config || {};

  try {
    // Validate query safety
    const validation = validateQuerySafety(sql, queryMode);
    if (!validation.valid) {
      logger.warn(`Query safety validation failed: ${validation.reason}`, { type, sql: sql?.substring(0, 50) });
      const error = new Error(validation.reason);
      error.isValidationError = true;
      throw error;
    }

    const connector = connectorFactory.getConnector(type);
    return await connector.executeQuery(config, sql, {
      timeout: queryTimeout || config.timeout || 30000,
      maxRows: maxRows || null,
    });
  } catch (error) {
    logger.error(`Query execution failed for ${type}:`, error);

    // If it's already a structured error, just re-throw it
    if (error.name === 'DatabaseError' || error.isValidationError) {
      throw error;
    }

    // Extract detailed database error
    const dbError = extractDatabaseError(error, type, sql);
    
    // Log the detailed error for debugging
    logger.error(`[Database Error Detail] ${type}:`, {
      message: dbError.message,
      code: dbError.code,
      sqlState: dbError.sqlState,
      isSyntaxError: dbError.isSyntaxError,
      isPermissionError: dbError.isPermissionError,
      isConnectionError: dbError.isConnectionError,
      isTimeoutError: dbError.isTimeoutError,
    });

    throw dbError;
  }
}

module.exports = {
  executeQuery,
  validateQuerySafety,
};
