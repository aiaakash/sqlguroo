/**
 * Dashboard icon options
 */
export type DashboardIcon =
  | 'chart-bar'
  | 'chart-line'
  | 'chart-pie'
  | 'dashboard'
  | 'analytics'
  | 'trending'
  | 'metrics'
  | 'report'
  | 'data'
  | 'grid'
  | 'layers'
  | 'activity'
  | 'target'
  | 'zap'
  | 'star';

/**
 * Chart item position and size in dashboard grid
 */
export interface IDashboardChartItem {
  chartId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  titleOverride?: string;
  static?: boolean;
}

/**
 * Dashboard layout breakpoints
 */
export interface IDashboardLayout {
  lg?: IDashboardChartItem[];
  md?: IDashboardChartItem[];
  sm?: IDashboardChartItem[];
  xs?: IDashboardChartItem[];
}

/**
 * Dashboard settings
 */
export interface IDashboardSettings {
  autoRefresh: number;
  showBorders: boolean;
  backgroundColor?: string;
  compactLayout: boolean;
  allowViewerResize: boolean;
}

/**
 * Dashboard permissions
 */
export interface IDashboardPermissions {
  shareId?: string;
  isPublic: boolean;
  viewers?: string[];
  editors?: string[];
}

/**
 * Dashboard document
 */
export interface TDashboard {
  _id: string;
  user: string;
  name: string;
  description?: string;
  icon: DashboardIcon;
  charts: IDashboardChartItem[];
  layouts?: IDashboardLayout;
  settings: IDashboardSettings;
  permissions: IDashboardPermissions;
  starred: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  tags?: string[];
  thumbnailUrl?: string;
  gridCols: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Chart preview for dashboard list
 */
export interface IChartPreview {
  _id: string;
  name: string;
  config: {
    type: string;
  };
}

/**
 * Dashboard list item with metadata
 */
export interface DashboardListItem extends TDashboard {
  chartCount: number;
  chartPreviews: IChartPreview[];
}

/**
 * Dashboard list response
 */
export interface DashboardsListResponse {
  dashboards: DashboardListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Chart with data for dashboard viewer
 */
export interface IDashboardChartWithData extends IDashboardChartItem {
  chart: {
    _id: string;
    name: string;
    description?: string;
    config: Record<string, unknown>;
    dataSnapshot: {
      columns: Array<{ name: string; type: string }>;
      rows: Record<string, unknown>[];
      capturedAt?: Date;
      rowCount: number;
    };
  };
}

/**
 * Dashboard with full chart data
 */
export interface DashboardWithChartsResponse extends TDashboard {
  chartsWithData: IDashboardChartWithData[];
}

/**
 * Create dashboard request
 */
export interface CreateDashboardRequest {
  name: string;
  description?: string;
  icon?: DashboardIcon;
  charts?: IDashboardChartItem[];
  settings?: Partial<IDashboardSettings>;
  tags?: string[];
  gridCols?: number;
}

/**
 * Update dashboard request
 */
export interface UpdateDashboardRequest {
  name?: string;
  description?: string;
  icon?: DashboardIcon;
  charts?: IDashboardChartItem[];
  layouts?: IDashboardLayout;
  settings?: Partial<IDashboardSettings>;
  permissions?: Partial<IDashboardPermissions>;
  starred?: boolean;
  isArchived?: boolean;
  tags?: string[];
  gridCols?: number;
}

/**
 * Add chart to dashboard request
 */
export interface AddChartToDashboardRequest {
  chartId: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  titleOverride?: string;
  static?: boolean;
}

/**
 * Update dashboard layout request
 */
export interface UpdateDashboardLayoutRequest {
  charts: IDashboardChartItem[];
}

/**
 * Query params for listing dashboards
 */
export interface GetDashboardsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  starredOnly?: boolean;
  archivedOnly?: boolean;
  sortBy?: 'name' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Type aliases
export type TDashboardChartItem = IDashboardChartItem;
export type TDashboardLayout = IDashboardLayout;
export type TDashboardSettings = IDashboardSettings;
export type TDashboardPermissions = IDashboardPermissions;

