const { ClickHouse } = require('clickhouse');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class ClickHouseConnector extends Connector {
    constructor() {
        super('clickhouse');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.host) errors.push('Host is required');
        if (!merged.port) errors.push('Port is required');
        if (!merged.database) errors.push('Database is required');
        return { valid: errors.length === 0, errors };
    }

    createClient(config) {
        const merged = this.getMergedConfig(config);
        const { host, port, database, username, password, ssl } = merged;

        return new ClickHouse({
            url: `${ssl ? 'https' : 'http'}://${host}:${port || 8123}`,
            debug: false,
            basicAuth: username
                ? {
                    username,
                    password,
                }
                : null,
            isUseGzip: false,
            format: 'json',
            config: {
                database,
            },
            request_timeout: 15000,
            max_execution_time: 15,
        });
    }

    async testConnection(config) {
        const startTime = Date.now();
        try {
            const client = this.createClient(config);
            const result = await client.query('SELECT version() as version').toPromise();

            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: result[0]?.version,
            };
        } catch (error) {
            throw error;
        }
    }

    async extractSchema(config) {
        const merged = this.getMergedConfig(config);
        const client = this.createClient(config);
        const startTime = Date.now();

        try {
            const tables = await client
                .query(
                    `SELECT name, total_rows
           FROM system.tables 
           WHERE database = '${merged.database}'
           ORDER BY name
           SETTINGS max_execution_time = 10`,
                )
                .toPromise();

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            const BATCH_SIZE = 5;
            for (let i = 0; i < tables.length; i += BATCH_SIZE) {
                const batch = tables.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batch.map(async (table) => {
                        const columns = await client
                            .query(
                                `SELECT
                  name,
                  type,
                  is_in_primary_key,
                  comment
                 FROM system.columns
                 WHERE database = '${merged.database}' AND table = '${table.name}'
                 ORDER BY position
                 SETTINGS max_execution_time = 10`,
                            )
                            .toPromise();

                        return {
                            name: table.name,
                            columns: columns.map((col) => ({
                                name: col.name,
                                type: col.type,
                                nullable: col.type.startsWith('Nullable'),
                                primaryKey: col.is_in_primary_key === 1,
                                comment: col.comment || undefined,
                            })),
                            rowCount: parseInt(table.total_rows, 10) || undefined,
                            sampleData: [],
                        };
                    })
                );
                schema.tables.push(...batchResults);
            }

            return schema;
        } catch (error) {
            throw error;
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        const client = this.createClient(config);
        const startTime = Date.now();

        try {
            let finalSql = sql.trim();
            const upperSql = finalSql.toUpperCase();
            const hasLimitAtEnd = /\bLIMIT\s+\d+\s*;?\s*$/i.test(finalSql);

            if (maxRows && upperSql.startsWith('SELECT') && !hasLimitAtEnd) {
                finalSql = finalSql.replace(/;\s*$/, '');
                finalSql = `${finalSql} LIMIT ${maxRows}`;
            }

            const rows = await client
                .query(`${finalSql} SETTINGS max_execution_time = ${Math.floor(timeout / 1000)}`)
                .toPromise();

            const executionTimeMs = Date.now() - startTime;

            let columns = [];
            if (rows.length > 0) {
                columns = Object.keys(rows[0]).map((name) => ({
                    name,
                    type: typeof rows[0][name],
                }));
            }

            const slicedRows = maxRows ? rows.slice(0, maxRows) : rows;

            return {
                columns,
                rows: slicedRows,
                rowCount: rows.length,
                executionTimeMs,
                truncated: maxRows ? rows.length >= maxRows : false,
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ClickHouseConnector;
