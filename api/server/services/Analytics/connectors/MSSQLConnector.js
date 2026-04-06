const mssql = require('mssql');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class MSSQLConnector extends Connector {
    constructor() {
        super('mssql');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.host) errors.push('Host is required');
        if (!merged.database) errors.push('Database is required');
        if (!merged.username) errors.push('Username is required');
        if (!merged.password) errors.push('Password is required');
        return { valid: errors.length === 0, errors };
    }

    async createPool(config) {
        const merged = this.getMergedConfig(config);
        const { host, port, database, username, password, ssl } = merged;

        const sqlConfig = {
            user: username,
            password,
            database,
            server: host,
            port: port || 1433,
            pool: {
                max: 5,
                min: 0,
                idleTimeoutMillis: 30000
            },
            options: {
                encrypt: ssl !== false,
                trustServerCertificate: true
            }
        };

        return await new mssql.ConnectionPool(sqlConfig).connect();
    }

    async testConnection(config) {
        const startTime = Date.now();
        let pool;
        try {
            pool = await this.createPool(config);
            const result = await pool.request().query('SELECT @@VERSION as version');
            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: result.recordset[0]?.version,
            };
        } finally {
            if (pool) await pool.close();
        }
    }

    async extractSchema(config) {
        let pool;
        try {
            pool = await this.createPool(config);
            const tablesResult = await pool.request().query(
                `SELECT t.name AS TableName, s.name AS SchemaName, p.rows AS RowCounts
         FROM sys.tables t
         INNER JOIN sys.indexes i ON t.object_id = i.object_id
         INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
         INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE t.is_ms_shipped = 0 AND i.index_id < 2
         GROUP BY t.name, s.name, p.rows
         ORDER BY t.name`
            );

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            for (const table of tablesResult.recordset) {
                const columnsResult = await pool.request()
                    .input('tableName', mssql.NVarChar, table.TableName)
                    .input('schemaName', mssql.NVarChar, table.SchemaName)
                    .query(
                        `SELECT c.name 'ColumnName', t.Name 'DataType', c.is_nullable 'IsNullable', ISNULL(i.is_primary_key, 0) 'IsPrimaryKey'
             FROM sys.columns c
             INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
             LEFT OUTER JOIN sys.index_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
             LEFT OUTER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             WHERE c.object_id = OBJECT_ID(@schemaName + '.' + @tableName)
             ORDER BY c.column_id`
                    );

                let sampleData = [];
                try {
                    const sampleResult = await pool.request().query(
                        `SELECT TOP 3 * FROM "${table.SchemaName}"."${table.TableName}"`
                    );
                    sampleData = sampleResult.recordset;
                } catch (err) {
                    logger.debug(`Could not fetch sample data for ${table.TableName}:`, err.message);
                }

                schema.tables.push({
                    name: `${table.SchemaName}.${table.TableName}`,
                    columns: columnsResult.recordset.map(col => ({
                        name: col.ColumnName,
                        type: col.DataType,
                        nullable: col.IsNullable,
                        primaryKey: !!col.IsPrimaryKey
                    })),
                    rowCount: table.RowCounts,
                    sampleData
                });
            }
            return schema;
        } finally {
            if (pool) await pool.close();
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        let pool;
        const startTime = Date.now();
        try {
            pool = await this.createPool(config);
            let finalSql = sql.trim();
            if (maxRows && finalSql.toUpperCase().startsWith('SELECT') && !/TOP\s+\d+/i.test(finalSql)) {
                finalSql = `SELECT TOP ${maxRows} ${finalSql.substring(6)}`;
            }

            const request = pool.request();
            request.timeout = timeout;
            const result = await request.query(finalSql);
            const executionTimeMs = Date.now() - startTime;

            let rows = result.recordset;
            if (maxRows && rows.length > maxRows) {
                rows = rows.slice(0, maxRows);
            }

            let columns = [];
            if (rows.length > 0) {
                columns = Object.keys(rows[0]).map(name => ({ name, type: 'MSSQL_TYPE' }));
            }

            return {
                columns,
                rows,
                rowCount: rows.length,
                executionTimeMs,
                truncated: maxRows ? result.recordset.length >= maxRows : false,
            };
        } finally {
            if (pool) await pool.close();
        }
    }
}

module.exports = MSSQLConnector;
