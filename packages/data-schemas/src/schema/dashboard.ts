import { Schema } from 'mongoose';
import type { IDashboard, IDashboardChartItem, IDashboardSettings, IDashboardPermissions } from '~/types/dashboard';

/**
 * Dashboard chart item sub-schema (grid position & size)
 */
const dashboardChartItemSchema = new Schema<IDashboardChartItem>(
  {
    chartId: {
      type: Schema.Types.ObjectId,
      ref: 'Chart',
      required: true,
    },
    x: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    y: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    w: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      default: 4,
    },
    h: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      default: 2,
    },
    titleOverride: {
      type: String,
      maxlength: 200,
    },
    static: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

/**
 * Dashboard settings sub-schema
 */
const dashboardSettingsSchema = new Schema<IDashboardSettings>(
  {
    autoRefresh: {
      type: Number,
      default: 0, // Disabled by default
      min: 0,
      max: 1440, // Max 24 hours
    },
    showBorders: {
      type: Boolean,
      default: true,
    },
    backgroundColor: {
      type: String,
    },
    compactLayout: {
      type: Boolean,
      default: false,
    },
    allowViewerResize: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

/**
 * Dashboard permissions sub-schema
 */
const dashboardPermissionsSchema = new Schema<IDashboardPermissions>(
  {
    shareId: {
      type: String,
      // Note: index defined at parent schema level as 'permissions.shareId'
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    viewers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    editors: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { _id: false }
);

/**
 * Dashboard layout schema for responsive breakpoints
 */
const dashboardLayoutSchema = new Schema(
  {
    lg: [dashboardChartItemSchema],
    md: [dashboardChartItemSchema],
    sm: [dashboardChartItemSchema],
    xs: [dashboardChartItemSchema],
  },
  { _id: false }
);

/**
 * Main Dashboard schema
 */
const dashboardSchema = new Schema<IDashboard>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Dashboard name is required'],
      maxlength: [200, 'Dashboard name cannot exceed 200 characters'],
      index: true,
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    icon: {
      type: String,
      enum: [
        'chart-bar',
        'chart-line',
        'chart-pie',
        'dashboard',
        'analytics',
        'trending',
        'metrics',
        'report',
        'data',
        'grid',
        'layers',
        'activity',
        'target',
        'zap',
        'star',
      ],
      default: 'dashboard',
    },
    charts: {
      type: [dashboardChartItemSchema],
      default: [],
    },
    layouts: {
      type: dashboardLayoutSchema,
    },
    settings: {
      type: dashboardSettingsSchema,
      default: () => ({
        autoRefresh: 0,
        showBorders: true,
        compactLayout: false,
        allowViewerResize: false,
      }),
    },
    permissions: {
      type: dashboardPermissionsSchema,
      default: () => ({
        isPublic: false,
      }),
    },
    starred: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    thumbnailUrl: {
      type: String,
    },
    gridCols: {
      type: Number,
      default: 12,
      min: 4,
      max: 24,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
dashboardSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });
dashboardSchema.index({ user: 1, starred: -1, updatedAt: -1 });
dashboardSchema.index({ user: 1, isArchived: 1, isDeleted: 1 });
dashboardSchema.index({ 'permissions.shareId': 1 }, { sparse: true });
dashboardSchema.index({ 'permissions.viewers': 1 }, { sparse: true });
dashboardSchema.index({ 'permissions.editors': 1 }, { sparse: true });

// Text index for search
dashboardSchema.index({ name: 'text', description: 'text', tags: 'text' });

export default dashboardSchema;

