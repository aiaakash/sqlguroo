import { Document, Types } from 'mongoose';

/**
 * Dashboard chart item position and size in the grid
 */
export interface IDashboardChartItem {
  chartId: Types.ObjectId | string;
  /** Grid position - column start (0-indexed) */
  x: number;
  /** Grid position - row start (0-indexed) */
  y: number;
  /** Width in grid units (1-12) */
  w: number;
  /** Height in grid units (1-4) */
  h: number;
  /** Optional custom title override */
  titleOverride?: string;
  /** Static item - cannot be dragged/resized */
  static?: boolean;
}

/**
 * Dashboard layout breakpoints for responsive design
 */
export interface IDashboardLayout {
  /** Large screens (>= 1200px) */
  lg?: IDashboardChartItem[];
  /** Medium screens (>= 996px) */
  md?: IDashboardChartItem[];
  /** Small screens (>= 768px) */
  sm?: IDashboardChartItem[];
  /** Extra small screens (< 768px) */
  xs?: IDashboardChartItem[];
}

/**
 * Dashboard settings
 */
export interface IDashboardSettings {
  /** Auto-refresh interval in minutes (0 = disabled) */
  autoRefresh: number;
  /** Show chart borders */
  showBorders: boolean;
  /** Dashboard background color */
  backgroundColor?: string;
  /** Compact layout (minimize gaps) */
  compactLayout: boolean;
  /** Enable drag and resize for viewers */
  allowViewerResize: boolean;
}

/**
 * Dashboard permissions
 */
export interface IDashboardPermissions {
  /** Public share ID for embedding */
  shareId?: string;
  /** Is publicly accessible */
  isPublic: boolean;
  /** Users with view access */
  viewers?: Types.ObjectId[];
  /** Users with edit access */
  editors?: Types.ObjectId[];
}

/**
 * Dashboard icon configuration
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
 * Main Dashboard document interface
 */
export interface IDashboard extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  name: string;
  description?: string;
  icon: DashboardIcon;
  /** Chart items with their positions */
  charts: IDashboardChartItem[];
  /** Responsive layouts (optional - defaults to charts array) */
  layouts?: IDashboardLayout;
  /** Dashboard settings */
  settings: IDashboardSettings;
  /** Permissions and sharing */
  permissions: IDashboardPermissions;
  /** Is starred/favorited by owner */
  starred: boolean;
  /** Soft delete flag */
  isDeleted: boolean;
  /** Is archived */
  isArchived: boolean;
  /** Tags for organization */
  tags?: string[];
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /** Number of columns in grid */
  gridCols: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type for creating a new dashboard
 */
export type CreateDashboardInput = Pick<IDashboard, 'name'> &
  Partial<Pick<IDashboard, 'description' | 'icon' | 'charts' | 'settings' | 'tags' | 'gridCols'>>;

/**
 * Type for updating a dashboard
 */
export type UpdateDashboardInput = Partial<
  Pick<
    IDashboard,
    | 'name'
    | 'description'
    | 'icon'
    | 'charts'
    | 'layouts'
    | 'settings'
    | 'permissions'
    | 'starred'
    | 'isArchived'
    | 'tags'
    | 'gridCols'
  >
>;

