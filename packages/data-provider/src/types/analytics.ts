/**
 * Analytics Types for Data Provider
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

export enum QueryMode {
  READ_ONLY = 'read_only',
  READ_WRITE = 'read_write',
}

export interface TDatabaseConnection {
  _id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  queryMode: QueryMode;
  queryTimeout: number;
  maxRows: number;
  organizationId: string;
  createdBy: string;
  isActive: boolean;
  isSystem?: boolean;
  lastTestedAt?: string;
  lastTestSuccess?: boolean;
  schemaCachedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TCreateDatabaseConnectionRequest {
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  sslCertificate?: string;
  queryMode?: QueryMode;
  queryTimeout?: number;
  maxRows?: number;
  organizationId: string;
}

export interface TUpdateDatabaseConnectionRequest {
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
}

export interface TConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverVersion?: string;
}

export interface TColumnSchema {
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

export interface TTableSchema {
  name: string;
  columns: TColumnSchema[];
  rowCount?: number;
  sampleData?: Record<string, unknown>[];
  description?: string;
}

export interface TDatabaseSchema {
  tables: TTableSchema[];
  lastUpdated: string;
}

export interface TAnalyticsChatRequest {
  question: string;
  connectionId: string;
  conversationId?: string;
  parentMessageId?: string;
  autoExecute?: boolean;
}

export interface TQueryColumn {
  name: string;
  type: string;
}

export interface TQueryResults {
  columns: TQueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
  suggestedChartType?: 'bar' | 'line' | 'pie' | 'table' | 'number';
}

export interface TAnalyticsChatResponse {
  messageId: string;
  conversationId: string;
  parentMessageId?: string | null;
  generatedSql: string;
  explanation: string;
  results?: TQueryResults | null;
  error?: string | null;
  success: boolean;
  totalTimeMs: number;
}

export interface TExecuteQueryRequest {
  sql: string;
  connectionId: string;
  messageId?: string;
  conversationId?: string;
}

export interface TQueryErrorDetails {
  code?: string;
  sqlState?: string;
  databaseType?: string;
  isSyntaxError?: boolean;
  isPermissionError?: boolean;
  isConnectionError?: boolean;
  isTimeoutError?: boolean;
}

export interface TExecuteQueryResponse {
  results?: TQueryResults;
  success: boolean;
  error?: string;
  errorDetails?: TQueryErrorDetails;
}

export interface TAnalyticsQuery {
  _id: string;
  user: string;
  conversationId: string;
  messageId: string;
  connectionId: string;
  question: string;
  generatedSql: string;
  userApproved: boolean;
  executedSql?: string;
  executionTimeMs?: number;
  rowCount?: number;
  error?: string;
  success: boolean;
  tokensUsed?: number;
  createdAt: string;
  updatedAt: string;
}

/* Analytics Query Reference (for charts) */
export interface TAnalyticsQueryRef {
  connectionId: string;
  sql: string;
  messageId: string;
  conversationId: string;
}

/* Skills Types */
export interface TSkill {
  _id: string;
  skillId: string;
  title: string;
  description: string;
  content: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TCreateSkillRequest {
  title: string;
  description: string;
  content: string;
  isActive?: boolean;
}

export interface TUpdateSkillRequest {
  title?: string;
  description?: string;
  content?: string;
  isActive?: boolean;
}

/* Saved Queries Types */

export interface TSavedQuery {
  _id: string;
  userId: string;
  name: string;
  sqlContent: string;
  description?: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TCreateSavedQueryRequest {
  name: string;
  sqlContent: string;
  description?: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  tags?: string[];
}

export interface TUpdateSavedQueryRequest {
  name?: string;
  sqlContent?: string;
  description?: string;
  tags?: string[];
}

export interface TListSavedQueriesParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
}

export interface TListSavedQueriesResponse {
  queries: TSavedQuery[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

/* GitHub Repo Connection Types */
export enum GitHubProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
}

export interface TGitHubRepoConnection {
  _id: string;
  userId: string;
  name: string;
  provider: GitHubProvider;
  owner: string;
  repo: string;
  branch: string;
  queryPath?: string;
  includePatterns: string[];
  excludePatterns: string[];
  isActive: boolean;
  lastSyncedAt?: string;
  lastSyncSuccess?: boolean;
  syncError?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TCreateGitHubRepoConnectionRequest {
  name: string;
  owner: string;
  repo: string;
  branch?: string;
  queryPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  accessToken: string;
}

export interface TUpdateGitHubRepoConnectionRequest {
  name?: string;
  branch?: string;
  queryPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  accessToken?: string;
  isActive?: boolean;
}
