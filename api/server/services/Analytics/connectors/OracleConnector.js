const oracledb = require('oracledb');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

try {
    oracledb.initOracleClient();
} catch (err) {
    // logger.debug('Oracle Client not initialized');
}

class OracleConnector extends Connector {
    constructor() {
        super('oracle');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.host) errors.push('Host is required');
        if (!merged.database) errors.push('Service Name is required');
        if (!merged.username) errors.push('Username is required');
        if (!merged.password) errors.push('Password is required');
        return { valid: errors.length === 0, errors };
    }

    async createConnection(config) {
        const merged = this.getMergedConfig(config);
        const { host, port, database, username, password } = merged;
        const connectString = `${host}:${port || 1521}/${database}`;

        return await oracledb.getConnection({
            user: username,
            password,
            connectString,
        });
    }

    async testConnection(config) {
        const startTime = Date.now();
        let connection;
        try {
            connection = await this.createConnection(config);
            const result = await connection.execute('SELECT * FROM v$version');
            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: result.rows[0]?.[0] || 'Oracle Database',
            };
        } finally {
            if (connection) await connection.close();
        }
    }

    async extractSchema(config) {
        let connection;
        try {
            connection = await this.createConnection(config);
            const tablesResult = await connection.execute(
                `SELECT table_name, num_rows FROM user_tables ORDER BY table_name`
            );

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            for (const row of tablesResult.rows) {
                const tableName = row[0];
                const rowCount = row[1];

                const columnsResult = await connection.execute(
                    `SELECT column_name, data_type, nullable
           FROM user_tab_columns 
           WHERE table_name = :tableName
           ORDER BY column_id`,
                    [tableName]
                );

                const pkResult = await connection.execute(
                    `SELECT cols.column_name
           FROM all_constraints cons, all_cons_columns cols
           WHERE cols.table_name = :tableName
           AND cons.constraint_type = 'P'
           AND cons.constraint_name = cols.constraint_name
           AND cons.owner = cols.owner`,
                    [tableName]
                );
                const pks = new Set(pkResult.rows.map(r => r[0]));

                let sampleData = [];
                try {
                    const sampleResult = await connection.execute(
                        `SELECT * FROM "${tableName}" FETCH FIRST 3 ROWS ONLY`
                    );
                    if (sampleResult.rows.length > 0 && sampleResult.metaData) {
                        sampleData = sampleResult.rows.map(row => {
                            const obj = {};
                            sampleResult.metaData.forEach((meta, idx) => {
                                obj[meta.name] = row[idx];
                            });
                            return obj;
                        });
                    }
                } catch (err) {
                    logger.debug(`Could not fetch sample data for ${tableName}:`, err.message);
                }

                schema.tables.push({
                    name: tableName,
                    columns: columnsResult.rows.map(col => ({
                        name: col[0],
                        type: col[1],
                        nullable: col[2] === 'Y',
                        primaryKey: pks.has(col[0]),
                    })),
                    rowCount: rowCount,
                    sampleData
                });
            }
            return schema;
        } finally {
            if (connection) await connection.close();
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        let connection;
        const startTime = Date.now();
        try {
            connection = await this.createConnection(config);
            let finalSql = sql.trim();
            if (maxRows && finalSql.toUpperCase().startsWith('SELECT') && !/FETCH FIRST/i.test(finalSql)) {
                finalSql = `${finalSql.replace(/;\s*$/, '')} FETCH FIRST ${maxRows} ROWS ONLY`;
            }

            const result = await connection.execute(finalSql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const executionTimeMs = Date.now() - startTime;

            let rows = result.rows;
            if (maxRows) {
                rows = rows.slice(0, maxRows);
            }

            return {
                columns: result.metaData ? result.metaData.map(m => ({ name: m.name, type: 'ORACLE_TYPE' })) : [],
                rows,
                rowCount: rows.length,
                executionTimeMs,
                truncated: maxRows ? result.rows.length >= maxRows : false,
            };
        } finally {
            if (connection) await connection.close();
        }
    }
}

module.exports = OracleConnector;
