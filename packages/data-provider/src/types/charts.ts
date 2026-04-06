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
  field: string;
  label?: string;
  type: 'number' | 'category' | 'date';
  format?: {
    decimals?: number;
    prefix?: string;
    suffix?: string;
    dateFormat?: string;
  };
}

/**
 * Series configuration for multi-series charts
 */
export interface IChartSeriesConfig {
  field: string;
  name: string;
  color?: string;
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
  formatter?: string;
}

/**
 * Complete chart configuration (Recharts props + custom styling)
 */
export interface IChartConfig {
  type: ChartType | string;
  title?: string;
  xAxis: IChartAxisConfig;
  yAxis: IChartAxisConfig | IChartAxisConfig[];
  series?: IChartSeriesConfig[];
  colors?: string[];
  legend?: IChartLegendConfig;
  tooltip?: IChartTooltipConfig;
  showGrid?: boolean;
  animate?: boolean;
  stacked?: boolean;
  aspectRatio?: number;
}

/**
 * Query reference for live data refresh
 */
export interface IChartQueryRef {
  connectionId?: string;
  sql?: string;
  queryHash?: string;
  analyticsQueryId?: string;
  messageId?: string;
  conversationId?: string;
}

/**
 * Snapshot of chart data (headers + rows)
 */
export interface IChartDataSnapshot {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Record<string, unknown>[];
  capturedAt?: Date;
  rowCount: number;
}

/**
 * User chart document interface
 */
export interface TChart {
  _id: string;
  user: string;
  name: string;
  description?: string;
  folderId?: string;
  config: IChartConfig;
  queryRef?: IChartQueryRef;
  dataSnapshot: IChartDataSnapshot;
  pinned: boolean;
  isDeleted: boolean;
  isPublic: boolean;
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
  queryRef?: IChartQueryRef;
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
  chart: TChart;
  data: {
    columns: Array<{ name: string; type: string }>;
    rows: Record<string, unknown>[];
    rowCount: number;
    refreshedAt: Date;
    fromCache: boolean;
  };
}

// Type aliases for convenience
export type TChartConfig = IChartConfig;
export type TChartAxisConfig = IChartAxisConfig;
export type TChartSeriesConfig = IChartSeriesConfig;
export type TChartLegendConfig = IChartLegendConfig;
export type TChartTooltipConfig = IChartTooltipConfig;
export type TChartQueryRef = IChartQueryRef;
export type TChartDataSnapshot = IChartDataSnapshot;

// Query params types
export interface GetChartsParams {
  page?: number;
  pageSize?: number;
  folderId?: string;
  pinnedOnly?: boolean;
  search?: string;
}
