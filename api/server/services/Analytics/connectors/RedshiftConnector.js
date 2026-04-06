const PostgreSQLConnector = require('./PostgreSQLConnector');

class RedshiftConnector extends PostgreSQLConnector {
    constructor() {
        super('redshift');
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

    // Redshift uses different system tables for statistics
    async extractSchema(config) {
        const pool = this.createPool(config);

        try {
            const tablesResult = await pool.query(
                `SELECT schemaname, tablename, 
                (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as row_count
         FROM pg_tables 
         WHERE schemaname = 'public'
         ORDER BY tablename`,
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
            is_nullable as nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
                    [table.schemaname, table.tablename],
                );

                let sampleData = [];
                try {
                    const sampleResult = await pool.query(
                        `SELECT * FROM "${table.schemaname}"."${table.tablename}" LIMIT 3`,
                    );
                    sampleData = sampleResult.rows;
                } catch (err) {
                    // logger.debug handled in parent but could be here too
                }

                schema.tables.push({
                    name: table.tablename,
                    columns: columnsResult.rows.map((col) => ({
                        name: col.name,
                        type: col.type,
                        nullable: col.nullable === 'YES',
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
}

module.exports = RedshiftConnector;
