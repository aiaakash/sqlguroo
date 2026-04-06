const { logger } = require('@librechat/data-schemas');

/**
 * Base Connector class
 * All specialized database connectors must extend this class
 */
class Connector {
    constructor(type) {
        this.type = type;
    }

    /**
     * Validate connection configuration
     * @param {Object} config - Connection configuration
     * @returns {Object} - { valid: boolean, errors: string[] }
     */
    validateConfig(config) {
        throw new Error('validateConfig must be implemented by subclass');
    }

    /**
     * Test a database connection
     * @param {Object} config - Connection configuration
     * @returns {Promise<Object>} - Test result
     */
    async testConnection(config) {
        throw new Error('testConnection must be implemented by subclass');
    }

    /**
     * Extract schema information from a database
     * @param {Object} config - Connection configuration
     * @returns {Promise<Object>} - Database schema
     */
    async extractSchema(config) {
        throw new Error('extractSchema must be implemented by subclass');
    }

    /**
     * Execute a SQL query
     * @param {Object} config - Connection configuration
     * @param {string} sql - SQL query to execute
     * @param {Object} options - Execution options (timeout, maxRows, etc.)
     * @returns {Promise<Object>} - Query results
     */
    async executeQuery(config, sql, options) {
        throw new Error('executeQuery must be implemented by subclass');
    }

    /**
     * Utility to merge legacy config with new connectionParams
     * @param {Object} config - Raw connection config from DB
     * @returns {Object} - Merged config
     */
    getMergedConfig(config) {
        const { connectionParams = {}, ...legacy } = config;
        return { ...legacy, ...connectionParams };
    }
}

module.exports = Connector;
