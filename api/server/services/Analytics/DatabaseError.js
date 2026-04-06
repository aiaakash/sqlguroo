/**
 * DatabaseError - A custom error class for database-related errors
 * Captures detailed error information from various database drivers
 */
class DatabaseError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'DatabaseError';
        
        // Database-specific error properties
        this.code = options.code || null;
        this.sqlState = options.sqlState || null;
        this.databaseType = options.databaseType || null;
        this.originalError = options.originalError || null;
        this.query = options.query || null;
        this.isSyntaxError = options.isSyntaxError || false;
        this.isPermissionError = options.isPermissionError || false;
        this.isConnectionError = options.isConnectionError || false;
        this.isTimeoutError = options.isTimeoutError || false;
    }

    /**
     * Get a user-friendly error message
     */
    getUserMessage() {
        // If we have a detailed message, use it
        if (this.message && this.message.length > 10) {
            return this.message;
        }
        
        // Fallback to categorized messages
        if (this.isConnectionError) {
            return `Could not connect to ${this.databaseType || 'the database'}. Please check your connection settings.`;
        }
        if (this.isPermissionError) {
            return `Access denied. Please check your credentials or permissions.`;
        }
        if (this.isTimeoutError) {
            return `Query timed out. Please try optimizing your query or increasing the timeout limit.`;
        }
        if (this.isSyntaxError) {
            return `SQL syntax error: ${this.message}`;
        }
        
        return this.message || 'An error occurred while executing the query.';
    }

    /**
     * Convert to a plain object for JSON serialization
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            sqlState: this.sqlState,
            databaseType: this.databaseType,
            isSyntaxError: this.isSyntaxError,
            isPermissionError: this.isPermissionError,
            isConnectionError: this.isConnectionError,
            isTimeoutError: this.isTimeoutError,
        };
    }
}

/**
 * Extract detailed error message from various database driver errors
 * @param {Error} error - The original error from the database driver
 * @param {string} databaseType - The type of database (postgresql, mysql, snowflake, etc.)
 * @param {string} sql - The SQL query that caused the error (optional)
 * @returns {DatabaseError} - A structured DatabaseError with detailed information
 */
function extractDatabaseError(error, databaseType, sql = null) {
    if (!error) {
        return new DatabaseError('Unknown error occurred', { databaseType });
    }

    // If it's already a DatabaseError, return it
    if (error instanceof DatabaseError) {
        return error;
    }

    const errorCode = error.code || error.errno || error.number || error.statusCode;
    const errorMessage = error.message || error.msg || error.errorMessage || 'Unknown error';
    const sqlState = error.sqlState || error.sqlstate || error.state || error.sqlStateCode;
    
    // Determine error category based on database type and error code
    let isSyntaxError = false;
    let isPermissionError = false;
    let isConnectionError = false;
    let isTimeoutError = false;

    // Check for syntax errors
    const syntaxErrorCodes = [
        'ER_PARSE_ERROR',           // MySQL
        '42601',                    // PostgreSQL - syntax_error
        'SYNTAX_ERROR',             // Snowflake
        ' syntax error',            // Common in messages
        'SyntaxError',              // BigQuery
        'Incorrect syntax',         // MSSQL
    ];
    
    isSyntaxError = syntaxErrorCodes.some(code => 
        (errorCode && String(errorCode).includes(code)) || 
        errorMessage.toLowerCase().includes(code.toLowerCase())
    );

    // Check for permission errors
    const permissionErrorCodes = [
        'ER_ACCESS_DENIED_ERROR',   // MySQL
        '42501',                    // PostgreSQL - insufficient_privilege
        '28000',                    // SQLState - invalid authorization
        'permission denied',        // Common
        'insufficient privileges',  // Common
        'Unauthorized',             // Common
    ];
    
    isPermissionError = permissionErrorCodes.some(code => 
        (errorCode && String(errorCode).includes(code)) || 
        errorMessage.toLowerCase().includes(code.toLowerCase())
    );

    // Check for connection errors
    const connectionErrorCodes = [
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNRESET',
        'ER_CON_COUNT_ERROR',       // MySQL
        '08001',                    // SQLState - unable to connect
        '08006',                    // SQLState - connection failure
        'connection refused',
        'could not connect',
    ];
    
    isConnectionError = connectionErrorCodes.some(code => 
        (errorCode && String(errorCode).includes(code)) || 
        errorMessage.toLowerCase().includes(code.toLowerCase())
    );

    // Check for timeout errors
    const timeoutErrorCodes = [
        'ER_QUERY_TIMEOUT',         // MySQL
        '57014',                    // PostgreSQL - query_canceled
        'QUERY_TIMEOUT',            // Snowflake
        'Query timeout',
        'statement timeout',
        'execution timeout',
    ];
    
    isTimeoutError = timeoutErrorCodes.some(code => 
        (errorCode && String(errorCode).includes(code)) || 
        errorMessage.toLowerCase().includes(code.toLowerCase())
    );

    // Extract the most meaningful message
    let detailedMessage = errorMessage;
    
    // For PostgreSQL, try to get the detailed error hint
    if (databaseType === 'postgresql' || databaseType === 'redshift') {
        // PostgreSQL errors often have 'hint', 'detail', and 'position' properties
        if (error.hint) {
            detailedMessage = `${errorMessage}. Hint: ${error.hint}`;
        } else if (error.detail) {
            detailedMessage = `${errorMessage}. Detail: ${error.detail}`;
        }
        if (error.position) {
            detailedMessage += ` (Position: ${error.position})`;
        }
    }
    
    // For Snowflake, extract the full error message
    if (databaseType === 'snowflake') {
        // Snowflake errors often have structured data
        if (error.data && error.data.errorMessage) {
            detailedMessage = error.data.errorMessage;
        }
        if (error.sqlText) {
            detailedMessage = detailedMessage.replace(error.sqlText, '[SQL]').trim();
        }
    }
    
    // For MySQL, extract SQLState info
    if (databaseType === 'mysql') {
        if (sqlState) {
            detailedMessage = `[SQLState ${sqlState}] ${errorMessage}`;
        }
    }
    
    // For MSSQL, extract procedure and line number info
    if (databaseType === 'mssql') {
        if (error.procName) {
            detailedMessage = `${errorMessage} (Procedure: ${error.procName}, Line: ${error.lineNumber || 'unknown'})`;
        } else if (error.lineNumber) {
            detailedMessage = `${errorMessage} (Line: ${error.lineNumber})`;
        }
    }
    
    // For BigQuery, extract the reason
    if (databaseType === 'bigquery') {
        if (error.errors && error.errors[0] && error.errors[0].message) {
            detailedMessage = error.errors[0].message;
            if (error.errors[0].location) {
                const loc = error.errors[0].location;
                detailedMessage += ` (Location: Line ${loc.line || '?'}, Column ${loc.column || '?'})`;
            }
        }
    }

    return new DatabaseError(detailedMessage, {
        code: errorCode,
        sqlState,
        databaseType,
        originalError: error,
        query: sql,
        isSyntaxError,
        isPermissionError,
        isConnectionError,
        isTimeoutError,
    });
}

module.exports = {
    DatabaseError,
    extractDatabaseError,
};
