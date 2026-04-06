import React from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  LayoutDashboard,
  TrendingUp,
  Activity,
  Target,
  Zap,
  Star,
  Layers,
  Database,
  Grid3X3,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardIcon as DashboardIconType } from 'librechat-data-provider';

const iconMap: Record<DashboardIconType, LucideIcon> = {
  'chart-bar': BarChart3,
  'chart-line': LineChart,
  'chart-pie': PieChart,
  dashboard: LayoutDashboard,
  analytics: FileBarChart,
  trending: TrendingUp,
  metrics: Activity,
  report: FileBarChart,
  data: Database,
  grid: Grid3X3,
  layers: Layers,
  activity: Activity,
  target: Target,
  zap: Zap,
  star: Star,
};

interface DashboardIconProps {
  icon: DashboardIconType;
  className?: string;
  size?: number;
}

export default function DashboardIcon({ icon, className = '', size = 20 }: DashboardIconProps) {
  const IconComponent = iconMap[icon] || LayoutDashboard;
  return <IconComponent className={className} size={size} />;
}

