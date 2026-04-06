const { BigQuery } = require('@google-cloud/bigquery');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class BigQueryConnector extends Connector {
    constructor() {
        super('bigquery');
    }

    validateConfig(config) {
        const merged = this.getMergedConfig(config);
        const errors = [];
        if (!merged.database) errors.push('Project ID (stored in database field) is required');
        if (!merged.password) errors.push('Service account credentials (stored in password field) are required');
        return { valid: errors.length === 0, errors };
    }

    createClient(config) {
        const merged = this.getMergedConfig(config);
        const { database, password } = merged;

        let credentials = null;
        if (password) {
            try {
                credentials = JSON.parse(password);
            } catch (e) {
                credentials = password;
            }
        }

        const options = {
            projectId: database,
        };

        if (credentials) {
            if (typeof credentials === 'string') {
                options.keyFilename = credentials;
            } else {
                options.credentials = credentials;
            }
        }

        return new BigQuery(options);
    }

    async testConnection(config) {
        const startTime = Date.now();
        try {
            const client = this.createClient(config);
            const [datasets] = await client.getDatasets({ maxResults: 1 });

            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: `BigQuery (${datasets.length} dataset(s) accessible)`,
            };
        } catch (error) {
            throw error;
        }
    }

    async extractSchema(config) {
        const client = this.createClient(config);

        try {
            const [datasets] = await client.getDatasets();
            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            for (const dataset of datasets) {
                const [tables] = await dataset.getTables();

                for (const table of tables) {
                    const [metadata] = await table.getMetadata();
                    const fields = metadata.schema?.fields || [];

                    let sampleData = [];
                    try {
                        const [rows] = await table.getRows({ maxResults: 3 });
                        sampleData = rows.map((row) => {
                            const obj = {};
                            fields.forEach((field, idx) => {
                                obj[field.name] = row[field.name];
                            });
                            return obj;
                        });
                    } catch (err) {
                        logger.debug(`Could not fetch sample data for ${table.id}:`, err.message);
                    }

                    schema.tables.push({
                        name: `${dataset.id}.${table.id}`,
                        columns: fields.map((field) => ({
                            name: field.name,
                            type: field.type,
                            nullable: field.mode === 'NULLABLE',
                            primaryKey: false,
                        })),
                        rowCount: parseInt(metadata.numRows, 10) || undefined,
                        sampleData,
                    });
                }
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

            const queryOptions = {
                query: finalSql,
                maxResults: maxRows || undefined,
                timeoutMs: timeout,
            };

            const [job] = await client.createQueryJob(queryOptions);
            const [rows] = await job.getQueryResults({ maxResults: maxRows || undefined });
            const executionTimeMs = Date.now() - startTime;

            let columns = [];
            if (rows.length > 0) {
                columns = Object.keys(rows[0]).map((name) => ({
                    name,
                    type: typeof rows[0][name],
                }));
            }

            return {
                columns,
                rows: maxRows ? rows.slice(0, maxRows) : rows,
                rowCount: rows.length,
                executionTimeMs,
                truncated: maxRows ? rows.length >= maxRows : false,
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = BigQueryConnector;
