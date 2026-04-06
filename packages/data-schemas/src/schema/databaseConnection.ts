import { Schema } from 'mongoose';
import type { IDatabaseConnection, IDatabaseSchema, ITableSchema, IColumnSchema } from '~/types';
import { DatabaseType, QueryMode } from '~/types';

// Column schema sub-document
const ColumnSchema = new Schema<IColumnSchema>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    nullable: { type: Boolean, default: true },
    primaryKey: { type: Boolean, default: false },
    foreignKey: {
      type: {
        table: String,
        column: String,
      },
      default: undefined,
    },
    comment: { type: String },
  },
  { _id: false },
);

// Table schema sub-document
const TableSchema = new Schema<ITableSchema>(
  {
    name: { type: String, required: true },
    columns: { type: [ColumnSchema], default: [] },
    rowCount: { type: Number },
    sampleData: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false },
);

// Database schema sub-document
const DatabaseSchemaSubDoc = new Schema<IDatabaseSchema>(
  {
    tables: { type: [TableSchema], default: [] },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false },
);

const databaseConnectionSchema = new Schema<IDatabaseConnection>(
  {
    name: {
      type: String,
      required: [true, 'Connection name is required'],
      trim: true,
      maxlength: [100, 'Connection name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Database type is required'],
      enum: Object.values(DatabaseType),
    },
    host: {
      type: String,
      trim: true,
      default: '',
    },
    port: {
      type: Number,
      min: [0, 'Port must be at least 0'],
      max: [65535, 'Port cannot exceed 65535'],
      default: 0,
    },
    database: {
      type: String,
      required: [true, 'Database name is required'],
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Don't include password by default in queries
    },
    ssl: {
      type: Boolean,
      default: false,
    },
    sslCertificate: {
      type: String,
      select: false,
    },
    queryMode: {
      type: String,
      enum: Object.values(QueryMode),
      default: QueryMode.READ_ONLY,
    },
    queryTimeout: {
      type: Number,
      default: 30000, // 30 seconds
      min: [1000, 'Query timeout must be at least 1000ms'],
      max: [300000, 'Query timeout cannot exceed 300000ms (5 minutes)'],
    },
    maxRows: {
      type: Number,
      default: 1000,
      min: [1, 'Max rows must be at least 1'],
      max: [100000, 'Max rows cannot exceed 100000'],
    },
    organizationId: {
      type: String,
      required: [true, 'Organization ID is required'],
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastTestedAt: {
      type: Date,
    },
    lastTestSuccess: {
      type: Boolean,
    },
    cachedSchema: {
      type: DatabaseSchemaSubDoc,
    },
    schemaCachedAt: {
      type: Date,
    },
    // User-provided context descriptions - stored separately from cachedSchema
    // so they persist even when schema is refreshed
    tableDescriptions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    columnDescriptions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    connectionParams: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient lookups
databaseConnectionSchema.index({ createdBy: 1, isActive: 1 });
databaseConnectionSchema.index({ organizationId: 1, isActive: 1 });
databaseConnectionSchema.index({ isSystem: 1, isActive: 1 });
// Partial unique index: only enforce uniqueness for active connections per user (non-system only)
// This allows reusing names of deleted connections and same names across different users
databaseConnectionSchema.index(
  { createdBy: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, isSystem: { $ne: true } },
  },
);
// Unique index for system connections (only one active system connection with same name)
databaseConnectionSchema.index(
  { isSystem: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true, isSystem: true },
  },
);

export default databaseConnectionSchema;
