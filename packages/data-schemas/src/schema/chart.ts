import { Schema, Document } from 'mongoose';
import type { IChart, ChartType, IChartConfig, IChartQueryRef, IChartDataSnapshot } from '~/types/chart';

/**
 * Axis configuration sub-schema
 */
const axisConfigSchema = new Schema(
  {
    field: { type: String, required: true },
    label: { type: String },
    type: { type: String, enum: ['number', 'category', 'date'], required: true },
    format: {
      decimals: { type: Number },
      prefix: { type: String },
      suffix: { type: String },
      dateFormat: { type: String },
    },
  },
  { _id: false },
);

/**
 * Series configuration sub-schema
 */
const seriesConfigSchema = new Schema(
  {
    field: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String },
    type: { type: String, enum: ['bar', 'line', 'area'] },
  },
  { _id: false },
);

/**
 * Legend configuration sub-schema
 */
const legendConfigSchema = new Schema(
  {
    show: { type: Boolean, default: true },
    position: { type: String, enum: ['top', 'bottom', 'left', 'right'], default: 'bottom' },
  },
  { _id: false },
);

/**
 * Tooltip configuration sub-schema
 */
const tooltipConfigSchema = new Schema(
  {
    show: { type: Boolean, default: true },
    formatter: { type: String },
  },
  { _id: false },
);

/**
 * Chart configuration sub-schema
 */
const chartConfigSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['bar', 'line', 'area', 'pie', 'scatter', 'radar', 'composed', 'funnel', 'treemap'],
      required: true,
    },
    title: { type: String },
    xAxis: { type: axisConfigSchema, required: true },
    yAxis: { type: Schema.Types.Mixed, required: true }, // Can be single or array
    series: [seriesConfigSchema],
    colors: [{ type: String }],
    legend: legendConfigSchema,
    tooltip: tooltipConfigSchema,
    showGrid: { type: Boolean, default: true },
    animate: { type: Boolean, default: true },
    stacked: { type: Boolean, default: false },
    aspectRatio: { type: Number, default: 2 },
  },
  { _id: false },
);

/**
 * Query reference sub-schema
 */
const queryRefSchema = new Schema(
  {
    connectionId: { type: Schema.Types.Mixed, ref: 'DatabaseConnection' },
    sql: { type: String },
    queryHash: { type: String },
    analyticsQueryId: { type: Schema.Types.ObjectId, ref: 'AnalyticsQuery' },
    messageId: { type: String },
    conversationId: { type: String },
  },
  { _id: false },
);

/**
 * Column schema for data snapshot
 */
const columnSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
  },
  { _id: false },
);

/**
 * Data snapshot sub-schema
 */
const dataSnapshotSchema = new Schema(
  {
    columns: { type: [columnSchema], required: true },
    rows: { type: [Schema.Types.Mixed], required: true },
    capturedAt: { type: Date, default: Date.now },
    rowCount: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * Main chart schema
 */
const chartSchema = new Schema<IChart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Chart name is required'],
      maxlength: [200, 'Chart name cannot exceed 200 characters'],
      index: true,
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    folderId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    config: {
      type: chartConfigSchema,
      required: [true, 'Chart configuration is required'],
    },
    queryRef: {
      type: queryRefSchema,
    },
    dataSnapshot: {
      type: dataSnapshotSchema,
      required: [true, 'Data snapshot is required'],
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true, // Allow multiple nulls
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
chartSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });
chartSchema.index({ user: 1, pinned: -1, updatedAt: -1 });
chartSchema.index({ user: 1, folderId: 1, isDeleted: 1 });
chartSchema.index({ organizationId: 1, isDeleted: 1, createdAt: -1 });
// Note: shareId index is already created by unique: true in field definition

export default chartSchema;

