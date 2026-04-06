const MySQLConnector = require('./MySQLConnector');
const BigQueryConnector = require('./BigQueryConnector');
const ClickHouseConnector = require('./ClickHouseConnector');
const PostgreSQLConnector = require('./PostgreSQLConnector');
const RedshiftConnector = require('./RedshiftConnector');
const SnowflakeConnector = require('./SnowflakeConnector');
const OracleConnector = require('./OracleConnector');
const MSSQLConnector = require('./MSSQLConnector');

class ConnectorFactory {
    constructor() {
        this.connectors = {
            mysql: new MySQLConnector(),
            bigquery: new BigQueryConnector(),
            clickhouse: new ClickHouseConnector(),
            postgresql: new PostgreSQLConnector(),
            redshift: new RedshiftConnector(),
            snowflake: new SnowflakeConnector(),
            oracle: new OracleConnector(),
            mssql: new MSSQLConnector(),
        };
    }

    getConnector(type) {
        const connector = this.connectors[type];
        if (!connector) {
            throw new Error(`Unsupported database type: ${type}`);
        }
        return connector;
    }
}

module.exports = new ConnectorFactory();
