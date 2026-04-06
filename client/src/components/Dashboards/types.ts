import type { DashboardIcon, IDashboardChartItem, TDashboard } from 'librechat-data-provider';

export interface DashboardGridItem {
  i: string; // Chart ID
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface ChartSize {
  label: string;
  value: string;
  w: number;
  h: number;
}

export const CHART_SIZES: ChartSize[] = [
  { label: 'Small', value: 'small', w: 3, h: 2 },
  { label: 'Medium', value: 'medium', w: 6, h: 2 },
  { label: 'Large', value: 'large', w: 6, h: 3 },
  { label: 'Wide', value: 'wide', w: 12, h: 2 },
  { label: 'Full', value: 'full', w: 12, h: 3 },
];

export const DASHBOARD_ICONS: { icon: DashboardIcon; label: string }[] = [
  { icon: 'dashboard', label: 'Dashboard' },
  { icon: 'chart-bar', label: 'Bar Chart' },
  { icon: 'chart-line', label: 'Line Chart' },
  { icon: 'chart-pie', label: 'Pie Chart' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'trending', label: 'Trending' },
  { icon: 'metrics', label: 'Metrics' },
  { icon: 'report', label: 'Report' },
  { icon: 'data', label: 'Data' },
  { icon: 'grid', label: 'Grid' },
  { icon: 'layers', label: 'Layers' },
  { icon: 'activity', label: 'Activity' },
  { icon: 'target', label: 'Target' },
  { icon: 'zap', label: 'Zap' },
  { icon: 'star', label: 'Star' },
];

export type ViewMode = 'grid' | 'list';
export type FilterTab = 'my' | 'shared' | 'starred' | 'archived';

