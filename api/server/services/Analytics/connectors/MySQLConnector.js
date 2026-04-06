const mysql = require('mysql2/promise');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class MySQLConnector extends Connector {
    constructor() {
        super('mysql');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.host) errors.push('Host is required');
        if (!merged.port) errors.push('Port is required');
        if (!merged.database) errors.push('Database is required');
        if (!merged.username) errors.push('Username is required');
        if (!merged.password) errors.push('Password is required');
        return { valid: errors.length === 0, errors };
    }

    async createPool(config) {
        const merged = this.getMergedConfig(config);
        const { host, port, database, username, password, ssl, sslCertificate } = merged;

        const connectionConfig = {
            host,
            port,
            database,
            user: username,
            password,
            connectionLimit: 5,
            connectTimeout: 10000,
        };

        if (ssl) {
            connectionConfig.ssl = sslCertificate ? { ca: sslCertificate } : true;
        }

        return mysql.createPool(connectionConfig);
    }

    async testConnection(config) {
        const startTime = Date.now();
        let pool;
        try {
            pool = await this.createPool(config);
            const [rows] = await pool.query('SELECT VERSION() as version');
            await pool.end();

            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: rows[0]?.version,
            };
        } catch (error) {
            if (pool) await pool.end();
            throw error;
        }
    }

    async extractSchema(config) {
        const merged = this.getMergedConfig(config);
        const pool = await this.createPool(config);

        try {
            const [tables] = await pool.query(
                `SELECT TABLE_NAME, TABLE_ROWS 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
                [merged.database],
            );

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            for (const table of tables) {
                const [columns] = await pool.query(
                    `SELECT 
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_KEY as columnKey,
            COLUMN_COMMENT as comment
           FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
                    [merged.database, table.TABLE_NAME],
                );

                const [foreignKeys] = await pool.query(
                    `SELECT 
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
           FROM information_schema.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = ? 
             AND TABLE_NAME = ?
             AND REFERENCED_TABLE_NAME IS NOT NULL`,
                    [merged.database, table.TABLE_NAME],
                );

                const fkMap = {};
                foreignKeys.forEach((fk) => {
                    fkMap[fk.COLUMN_NAME] = {
                        table: fk.REFERENCED_TABLE_NAME,
                        column: fk.REFERENCED_COLUMN_NAME,
                    };
                });

                let sampleData = [];
                try {
                    const [samples] = await pool.query(
                        `SELECT * FROM \`${table.TABLE_NAME}\` LIMIT 3`,
                    );
                    sampleData = samples;
                } catch (err) {
                    logger.debug(`Could not fetch sample data for ${table.TABLE_NAME}:`, err.message);
                }

                schema.tables.push({
                    name: table.TABLE_NAME,
                    columns: columns.map((col) => ({
                        name: col.name,
                        type: col.type,
                        nullable: col.nullable === 'YES',
                        primaryKey: col.columnKey === 'PRI',
                        foreignKey: fkMap[col.name],
                        comment: col.comment || undefined,
                    })),
                    rowCount: table.TABLE_ROWS,
                    sampleData,
                });
            }

            await pool.end();
            return schema;
        } catch (error) {
            if (pool) await pool.end();
            throw error;
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        const pool = await this.createPool(config);
        const startTime = Date.now();

        try {
            await pool.query(`SET SESSION MAX_EXECUTION_TIME = ${timeout}`);

            let finalSql = sql.trim();
            const upperSql = finalSql.toUpperCase();
            const hasLimitAtEnd = /\bLIMIT\s+\d+\s*;?\s*$/i.test(finalSql);

            // Only add LIMIT if maxRows is specified and query doesn't already have one
            if (maxRows && upperSql.startsWith('SELECT') && !hasLimitAtEnd) {
                finalSql = finalSql.replace(/;\s*$/, '');
                finalSql = `${finalSql} LIMIT ${maxRows}`;
            }

            const [rows, fields] = await pool.query(finalSql);
            const executionTimeMs = Date.now() - startTime;

            let resultRows = [];
            let columns = [];
            let truncated = false;

            if (Array.isArray(rows)) {
                // Only slice if maxRows is specified
                resultRows = maxRows ? rows.slice(0, maxRows) : rows;
                truncated = maxRows ? rows.length > maxRows : false;

                if (fields && Array.isArray(fields)) {
                    columns = fields.map((field) => ({
                        name: field.name,
                        type: this.getMySQLTypeName(field.type),
                    }));
                } else if (resultRows.length > 0) {
                    columns = Object.keys(resultRows[0]).map((name) => ({
                        name,
                        type: typeof resultRows[0][name],
                    }));
                }
            }

            await pool.end();

            return {
                columns,
                rows: resultRows,
                rowCount: Array.isArray(rows) ? rows.length : 0,
                executionTimeMs,
                truncated,
            };
        } catch (error) {
            if (pool) await pool.end();
            throw error;
        }
    }

    getMySQLTypeName(typeNum) {
        const types = {
            0: 'DECIMAL', 1: 'TINYINT', 2: 'SMALLINT', 3: 'INT', 4: 'FLOAT',
            5: 'DOUBLE', 6: 'NULL', 7: 'TIMESTAMP', 8: 'BIGINT', 9: 'MEDIUMINT',
            10: 'DATE', 11: 'TIME', 12: 'DATETIME', 13: 'YEAR', 14: 'NEWDATE',
            15: 'VARCHAR', 16: 'BIT', 245: 'JSON', 246: 'NEWDECIMAL', 247: 'ENUM',
            248: 'SET', 249: 'TINY_BLOB', 250: 'MEDIUM_BLOB', 251: 'LONG_BLOB',
            252: 'BLOB', 253: 'VAR_STRING', 254: 'STRING', 255: 'GEOMETRY',
        };
        return types[typeNum] || 'UNKNOWN';
    }
}

module.exports = MySQLConnector;
