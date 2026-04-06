import type { Document, Types } from 'mongoose';

/**
 * Supported chart types using Recharts
 */
export enum ChartType {
  BAR = 'bar',
  LINE = 'line',
  AREA = 'area',
  PIE = 'pie',
  SCATTER = 'scatter',
  RADAR = 'radar',
  COMPOSED = 'composed',
  FUNNEL = 'funnel',
  TREEMAP = 'treemap',
}

/**
 * Axis configuration for charts
 */
export interface IChartAxisConfig {
  /** Field name from data to use */
  field: string;
  /** Display label for axis */
  label?: string;
  /** Data type of the field */
  type: 'number' | 'category' | 'date';
  /** Formatting options */
  format?: {
    /** Number of decimal places */
    decimals?: number;
    /** Prefix (e.g., '$') */
    prefix?: string;
    /** Suffix (e.g., '%') */
    suffix?: string;
    /** Date format string */
    dateFormat?: string;
  };
}

/**
 * Series configuration for multi-series charts
 */
export interface IChartSeriesConfig {
  /** Field name for the series data */
  field: string;
  /** Display name for the series */
  name: string;
  /** Color for the series */
  color?: string;
  /** Chart type for this series (for composed charts) */
  type?: 'bar' | 'line' | 'area';
}

/**
 * Legend configuration
 */
export interface IChartLegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Tooltip configuration
 */
export interface IChartTooltipConfig {
  show: boolean;
  /** Custom formatter template */
  formatter?: string;
}

/**
 * Complete chart configuration (Recharts props + custom styling)
 */
export interface IChartConfig {
  /** Chart type */
  type: ChartType;
  /** Chart title */
  title?: string;
  /** X-axis configuration */
  xAxis: IChartAxisConfig;
  /** Y-axis configuration (can be multiple for composed charts) */
  yAxis: IChartAxisConfig | IChartAxisConfig[];
  /** Series configurations for multi-series data */
  series?: IChartSeriesConfig[];
  /** Color palette */
  colors?: string[];
  /** Legend settings */
  legend?: IChartLegendConfig;
  /** Tooltip settings */
  tooltip?: IChartTooltipConfig;
  /** Grid settings */
  showGrid?: boolean;
  /** Animation enabled */
  animate?: boolean;
  /** Stack bars/areas */
  stacked?: boolean;
  /** Aspect ratio for responsive sizing */
  aspectRatio?: number;
}

/**
 * Query reference for live data refresh
 */
export interface IChartQueryRef {
  /** Database connection ID */
  connectionId?: Types.ObjectId | string;
  /** Original SQL query */
  sql?: string;
  /** Hash of the query for caching */
  queryHash?: string;
  /** Analytics query ID */
  analyticsQueryId?: Types.ObjectId | string;
  /** Message ID that generated this data */
  messageId?: string;
  /** Conversation ID */
  conversationId?: string;
}

/**
 * Snapshot of chart data (headers + rows)
 */
export interface IChartDataSnapshot {
  /** Column headers with types */
  columns: Array<{
    name: string;
    type: string;
  }>;
  /** Data rows */
  rows: Record<string, unknown>[];
  /** When data was captured */
  capturedAt: Date;
  /** Row count */
  rowCount: number;
}

/**
 * User chart document interface
 */
export interface IChart extends Document {
  /** Unique identifier */
  _id: Types.ObjectId;
  /** User who owns this chart */
  user: Types.ObjectId;
  /** Chart name */
  name: string;
  /** Optional description */
  description?: string;
  /** Folder ID for organization */
  folderId?: Types.ObjectId;
  /** Chart configuration (Recharts props) */
  config: IChartConfig;
  /** Query reference for live data */
  queryRef?: IChartQueryRef;
  /** Snapshot of data at creation time */
  dataSnapshot: IChartDataSnapshot;
  /** Whether chart is pinned to top */
  pinned: boolean;
  /** Soft delete flag */
  isDeleted: boolean;
  /** Public sharing enabled */
  isPublic: boolean;
  /** Share ID for public access */
  shareId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new chart
 */
export interface CreateChartRequest {
  name: string;
  description?: string;
  folderId?: string;
  config: IChartConfig;
  queryRef?: Omit<IChartQueryRef, 'connectionId' | 'analyticsQueryId'> & {
    connectionId?: string;
    analyticsQueryId?: string;
  };
  dataSnapshot: Omit<IChartDataSnapshot, 'capturedAt'>;
  pinned?: boolean;
}

/**
 * Request to update a chart
 */
export interface UpdateChartRequest {
  name?: string;
  description?: string;
  folderId?: string | null;
  config?: IChartConfig;
  pinned?: boolean;
  isPublic?: boolean;
}

/**
 * Chart list response item
 */
export interface ChartListItem {
  _id: string;
  name: string;
  description?: string;
  config: IChartConfig;
  pinned: boolean;
  isPublic: boolean;
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Chart list response
 */
export interface ChartsListResponse {
  charts: ChartListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Chart with refreshed data response
 */
export interface ChartWithDataResponse {
  chart: IChart;
  data: {
    columns: Array<{ name: string; type: string }>;
    rows: Record<string, unknown>[];
    rowCount: number;
    refreshedAt: Date;
    fromCache: boolean;
  };
}

