import type { Document, Types } from 'mongoose';

/**
 * Supported database types for analytics connections
 */
export enum DatabaseType {
  CLICKHOUSE = 'clickhouse',
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql',
  BIGQUERY = 'bigquery',
  REDSHIFT = 'redshift',
  SNOWFLAKE = 'snowflake',
  ORACLE = 'oracle',
  MSSQL = 'mssql',
}

/**
 * Query execution mode - controls what types of queries can be executed
 */
export enum QueryMode {
  READ_ONLY = 'read_only',
  READ_WRITE = 'read_write',
}

/**
 * Database connection configuration
 */
export interface IDatabaseConnection extends Document {
  /** Unique identifier */
  _id: Types.ObjectId;
  /** Display name for the connection */
  name: string;
  /** Type of database (clickhouse, mysql, postgresql, bigquery, redshift) */
  type: DatabaseType;
  /** Database host */
  host?: string;
  /** Database port */
  port?: number;
  /** Database name */
  database: string;
  /** Username for authentication */
  username?: string;
  /** Encrypted password */
  password: string;
  /** Whether to use SSL/TLS */
  ssl: boolean;
  /** SSL certificate (optional) */
  sslCertificate?: string;
  /** Query execution mode (read_only or read_write) */
  queryMode: QueryMode;
  /** Query timeout in milliseconds */
  queryTimeout: number;
  /** Maximum rows to return per query */
  maxRows: number;
  /** Organization ID that owns this connection */
  organizationId: string;
  /** User ID who created this connection (null for system connections) */
  createdBy?: Types.ObjectId | null;
  /** Whether the connection is active */
  isActive: boolean;
  /** Whether this is a system/shared connection (not editable by users) */
  isSystem?: boolean;
  /** Last time connection was tested */
  lastTestedAt?: Date;
  /** Last test result */
  lastTestSuccess?: boolean;
  /** Cached schema information */
  cachedSchema?: IDatabaseSchema;
  /** When schema was last cached */
  schemaCachedAt?: Date;
  /** User-provided table descriptions - persists across schema refreshes */
  tableDescriptions?: Record<string, string>;
  /** User-provided column descriptions - persists across schema refreshes */
  columnDescriptions?: Record<string, string>;
  /** Type-specific connection parameters */
  connectionParams?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database schema information
 */
export interface IDatabaseSchema {
  tables: ITableSchema[];
  lastUpdated: Date;
}

/**
 * Table schema information
 */
export interface ITableSchema {
  name: string;
  columns: IColumnSchema[];
  rowCount?: number;
  sampleData?: Record<string, unknown>[];
  description?: string;
}

/**
 * Column schema information
 */
export interface IColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
  comment?: string;
  description?: string;
}

/**
 * Analytics query history
 */
export interface IAnalyticsQuery extends Document {
  /** Unique identifier */
  _id: Types.ObjectId;
  /** User who executed the query */
  user: Types.ObjectId;
  /** Conversation ID this query belongs to */
  conversationId: string;
  /** Message ID this query is associated with */
  messageId: string;
  /** Database connection used */
  connectionId: string;
  /** Original natural language question */
  question: string;
  /** Generated SQL query */
  generatedSql: string;
  /** Whether user approved/modified the query */
  userApproved: boolean;
  /** Final executed SQL (may differ from generated) */
  executedSql?: string;
  /** Query execution time in milliseconds */
  executionTimeMs?: number;
  /** Number of rows returned */
  rowCount?: number;
  /** Query results (limited) */
  results?: Record<string, unknown>[];
  /** Error message if query failed */
  error?: string;
  /** Whether execution was successful */
  success: boolean;
  /** Tokens used for generation */
  tokensUsed?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new database connection
 */
export interface CreateDatabaseConnectionRequest {
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password: string;
  ssl?: boolean;
  sslCertificate?: string;
  queryMode?: QueryMode;
  queryTimeout?: number;
  maxRows?: number;
  organizationId: string;
  connectionParams?: Record<string, any>;
}

/**
 * Request to update a database connection
 */
export interface UpdateDatabaseConnectionRequest {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslCertificate?: string;
  queryMode?: QueryMode;
  queryTimeout?: number;
  maxRows?: number;
  isActive?: boolean;
  connectionParams?: Record<string, any>;
}

/**
 * Analytics chat request
 */
export interface AnalyticsChatRequest {
  /** The user's question */
  question: string;
  /** Database connection ID to use */
  connectionId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Parent message ID */
  parentMessageId?: string;
  /** Whether to auto-execute the generated query */
  autoExecute?: boolean;
}

/**
 * Analytics chat response
 */
export interface AnalyticsChatResponse {
  /** Response message ID */
  messageId: string;
  /** Conversation ID */
  conversationId: string;
  /** Generated SQL query */
  generatedSql: string;
  /** Explanation of the query */
  explanation: string;
  /** Query results (if executed) */
  results?: QueryResults;
  /** Error message if any */
  error?: string;
}

/**
 * Query execution results
 */
export interface QueryResults {
  /** Column definitions */
  columns: Array<{
    name: string;
    type: string;
  }>;
  /** Row data */
  rows: Record<string, unknown>[];
  /** Total row count */
  rowCount: number;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Suggested chart type based on data */
  suggestedChartType?: 'bar' | 'line' | 'pie' | 'table' | 'number';
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverVersion?: string;
}
