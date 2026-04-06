const { Pool } = require('pg');
const Connector = require('./BaseConnector');
const { logger } = require('@librechat/data-schemas');

class PostgreSQLConnector extends Connector {
    constructor(type = 'postgresql') {
        super(type);
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

    createPool(config) {
        const merged = this.getMergedConfig(config);
        const { host, port, database, username, password, ssl, sslCertificate } = merged;

        const connectionConfig = {
            host,
            port,
            database,
            user: username,
            password,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };

        if (ssl) {
            connectionConfig.ssl = sslCertificate ? { ca: sslCertificate } : { rejectUnauthorized: false };
        }

        return new Pool(connectionConfig);
    }

    async testConnection(config) {
        const startTime = Date.now();
        const pool = this.createPool(config);
        try {
            const result = await pool.query('SELECT version() as version');
            await pool.end();

            return {
                success: true,
                message: 'Connection successful',
                latencyMs: Date.now() - startTime,
                serverVersion: result.rows[0]?.version,
            };
        } catch (error) {
            await pool.end();
            throw error;
        }
    }

    async extractSchema(config) {
        const pool = this.createPool(config);

        try {
            const tablesResult = await pool.query(
                `SELECT table_name, 
                (SELECT reltuples::bigint FROM pg_class WHERE relname = table_name) as row_count
         FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
            );

            const schema = {
                tables: [],
                lastUpdated: new Date(),
            };

            for (const table of tablesResult.rows) {
                const columnsResult = await pool.query(
                    `SELECT 
            column_name as name,
            data_type as type,
            is_nullable as nullable,
            (SELECT COUNT(*) FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
             WHERE tc.table_name = $1 AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY') > 0 as is_primary_key
           FROM information_schema.columns c
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
                    [table.table_name],
                );

                const fkResult = await pool.query(
                    `SELECT 
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
           FROM information_schema.table_constraints AS tc
           JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
           JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
           WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1`,
                    [table.table_name],
                );

                const fkMap = {};
                fkResult.rows.forEach((fk) => {
                    fkMap[fk.column_name] = {
                        table: fk.foreign_table_name,
                        column: fk.foreign_column_name,
                    };
                });

                let sampleData = [];
                try {
                    const sampleResult = await pool.query(
                        `SELECT * FROM "${table.table_name}" LIMIT 3`,
                    );
                    sampleData = sampleResult.rows;
                } catch (err) {
                    logger.debug(`Could not fetch sample data for ${table.table_name}:`, err.message);
                }

                schema.tables.push({
                    name: table.table_name,
                    columns: columnsResult.rows.map((col) => ({
                        name: col.name,
                        type: col.type,
                        nullable: col.nullable === 'YES',
                        primaryKey: col.is_primary_key,
                        foreignKey: fkMap[col.name],
                    })),
                    rowCount: parseInt(table.row_count, 10) || undefined,
                    sampleData,
                });
            }

            await pool.end();
            return schema;
        } catch (error) {
            await pool.end();
            throw error;
        }
    }

    async executeQuery(config, sql, options = {}) {
        const { timeout = 30000, maxRows = null } = options;
        const pool = this.createPool(config);
        const startTime = Date.now();

        try {
            let finalSql = sql.trim();
            const upperSql = finalSql.toUpperCase();
            const hasLimitAtEnd = /\bLIMIT\s+\d+\s*;?\s*$/i.test(finalSql);

            // Only add LIMIT if maxRows is specified and query doesn't already have one
            if (maxRows && upperSql.startsWith('SELECT') && !hasLimitAtEnd) {
                finalSql = finalSql.replace(/;\s*$/, '');
                finalSql = `${finalSql} LIMIT ${maxRows}`;
            }

            const client = await pool.connect();
            try {
                await client.query(`SET statement_timeout = ${timeout}`);
                const result = await client.query(finalSql);
                const executionTimeMs = Date.now() - startTime;

                let columns = [];
                if (result.fields) {
                    columns = result.fields.map((field) => ({
                        name: field.name,
                        type: field.dataTypeID.toString(), // Simplified
                    }));
                }

                // Only slice if maxRows is specified
                const slicedRows = maxRows ? result.rows.slice(0, maxRows) : result.rows;

                return {
                    columns,
                    rows: slicedRows,
                    rowCount: result.rows.length,
                    executionTimeMs,
                    truncated: maxRows ? result.rows.length >= maxRows : false,
                };
            } finally {
                client.release();
            }
        } catch (error) {
            throw error;
        } finally {
            await pool.end();
        }
    }
}

module.exports = PostgreSQLConnector;
