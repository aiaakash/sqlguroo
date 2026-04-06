const snowflake = require('snowflake-sdk');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class SnowflakeConnector extends Connector {
    constructor() {
        super('snowflake');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.host) errors.push('Host (Account) is required');
        if (!merged.username) errors.push('Username is required');
        if (!merged.password) errors.push('Password is required');
        if (!merged.database) errors.push('Database is required');
        return { valid: errors.length === 0, errors };
    }

    createConnection(config) {
        const merged = this.getMergedConfig(config);
        const { host, username, password, database, schema = 'PUBLIC', warehouse, role } = merged;

        return snowflake.createConnection({
            account: host.split('.')[0],
            username,
            password,
            database,
            schema,
            warehouse,
            role,
        });
    }

    async testConnection(config) {
        const startTime = Date.now();
        const connection = this.createConnection(config);
        try {
            await new Promise((resolve, reject) => {
                connection.connect((err, conn) => {
                    if (err) reject(err);
                    else resolve(conn);
                });
            });

            const rows = await new Promise((resolve, reject) => {
                connection.execute({
                    sqlText: 'SELECT CURRENT_VERSION() as version',
                    complete: (err, stmt, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                });
            });

            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: rows[0]?.VERSION || rows[0]?.version,
            };
        } finally {
            if (connection.isUp()) {
                await new Promise(resolve => connection.destroy(resolve));
            }
        }
    }

    async extractSchema(config) {
        const merged = this.getMergedConfig(config);
        const connection = this.createConnection(config);
        try {
            await new Promise((resolve, reject) => {
                connection.connect((err, conn) => {
                    if (err) reject(err);
                    else resolve(conn);
                });
            });

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            const tables = await new Promise((resolve, reject) => {
                connection.execute({
                    sqlText: `SELECT TABLE_NAME, ROW_COUNT 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = '${merged.schema || 'PUBLIC'}' 
                    AND TABLE_TYPE = 'BASE TABLE'`,
                    complete: (err, stmt, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                });
            });

            for (const table of tables) {
                const columns = await new Promise((resolve, reject) => {
                    connection.execute({
                        sqlText: `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT
                      FROM INFORMATION_SCHEMA.COLUMNS 
                      WHERE TABLE_SCHEMA = '${merged.schema || 'PUBLIC'}' 
                      AND TABLE_NAME = '${table.TABLE_NAME}'
                      ORDER BY ORDINAL_POSITION`,
                        complete: (err, stmt, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        }
                    });
                });

                let sampleData = [];
                try {
                    sampleData = await new Promise((resolve, reject) => {
                        connection.execute({
                            sqlText: `SELECT * FROM "${table.TABLE_NAME}" LIMIT 3`,
                            complete: (err, stmt, rows) => {
                                if (err) reject(err);
                                else resolve(rows);
                            }
                        });
                    });
                } catch (err) {
                    logger.debug(`Could not fetch sample data for ${table.TABLE_NAME}:`, err.message);
                }

                schema.tables.push({
                    name: table.TABLE_NAME,
                    columns: columns.map(col => ({
                        name: col.COLUMN_NAME,
                        type: col.DATA_TYPE,
                        nullable: col.IS_NULLABLE === 'YES',
                        comment: col.COMMENT || undefined
                    })),
                    rowCount: parseInt(table.ROW_COUNT, 10) || undefined,
                    sampleData
                });
            }

            return schema;
        } finally {
            if (connection.isUp()) {
                await new Promise(resolve => connection.destroy(resolve));
            }
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        const connection = this.createConnection(config);
        const startTime = Date.now();

        try {
            await new Promise((resolve, reject) => {
                connection.connect((err, conn) => {
                    if (err) reject(err);
                    else resolve(conn);
                });
            });

            let finalSql = sql.trim();
            if (maxRows && finalSql.toUpperCase().startsWith('SELECT') && !/\bLIMIT\s+\d+/i.test(finalSql)) {
                finalSql = `${finalSql.replace(/;\s*$/, '')} LIMIT ${maxRows}`;
            }

            const rows = await new Promise((resolve, reject) => {
                connection.execute({
                    sqlText: finalSql,
                    complete: (err, stmt, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                });
            });

            const executionTimeMs = Date.now() - startTime;
            let columns = [];
            if (rows.length > 0) {
                columns = Object.keys(rows[0]).map(name => ({
                    name,
                    type: 'SNOWFLAKE_TYPE'
                }));
            }

            return {
                columns,
                rows: maxRows ? rows.slice(0, maxRows) : rows,
                rowCount: rows.length,
                executionTimeMs,
                truncated: maxRows ? rows.length >= maxRows : false,
            };
        } finally {
            if (connection.isUp()) {
                await new Promise(resolve => connection.destroy(resolve));
            }
        }
    }
}

module.exports = SnowflakeConnector;
