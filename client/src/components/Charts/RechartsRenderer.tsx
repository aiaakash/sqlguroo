import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ComposedChart,
} from 'recharts';

// Default color palette
const DEFAULT_COLORS = [
  '#8b5cf6', // violet-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
];

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar' | 'composed';

export interface AxisConfig {
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

export interface SeriesConfig {
  field: string;
  name: string;
  color?: string;
  type?: 'bar' | 'line' | 'area';
}

export interface ChartConfig {
  type: ChartType;
  title?: string;
  xAxis: AxisConfig;
  yAxis: AxisConfig | AxisConfig[];
  series?: SeriesConfig[];
  colors?: string[];
  legend?: {
    show: boolean;
    position: 'top' | 'bottom' | 'left' | 'right';
  };
  tooltip?: {
    show: boolean;
    formatter?: string;
  };
  showGrid?: boolean;
  animate?: boolean;
  stacked?: boolean;
  aspectRatio?: number;
}

export interface RechartsRendererProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  width?: number | string;
  height?: number;
  className?: string;
}

// Format value based on axis config
const formatValue = (value: unknown, format?: AxisConfig['format']): string => {
  if (value === null || value === undefined) return '';

  let formatted = String(value);

  if (typeof value === 'number' && format) {
    if (format.decimals !== undefined) {
      formatted = value.toFixed(format.decimals);
    }
    if (format.prefix) {
      formatted = format.prefix + formatted;
    }
    if (format.suffix) {
      formatted = formatted + format.suffix;
    }
  }

  return formatted;
};

// Custom tooltip component
const CustomTooltip = ({
  active,
  payload,
  label,
  xAxisConfig,
  yAxisConfig,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  xAxisConfig: AxisConfig;
  yAxisConfig: AxisConfig | AxisConfig[];
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const yAxes = Array.isArray(yAxisConfig) ? yAxisConfig : [yAxisConfig];
  const getFormat = (name: string) => {
    const axis = yAxes.find((y) => y.field === name || y.label === name);
    return axis?.format;
  };

  return (
    <div className="rounded-lg border border-border-light bg-surface-primary p-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-text-primary">
        {xAxisConfig.label || xAxisConfig.field}: {label}
      </p>
      {payload.map((entry, index) => (
        <p key={index} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {formatValue(entry.value, getFormat(entry.name))}
        </p>
      ))}
    </div>
  );
};

export default function RechartsRenderer({
  config,
  data,
  width = '100%',
  height = 300,
  className = '',
}: RechartsRendererProps) {
  const {
    type,
    xAxis,
    yAxis,
    series,
    colors = DEFAULT_COLORS,
    legend = { show: true, position: 'bottom' },
    tooltip = { show: true },
    showGrid = true,
    animate = true,
    stacked = false,
  } = config;

  // Determine Y-axis fields
  const yAxes = useMemo(() => {
    if (series && series.length > 0) {
      return series;
    }
    const yAxisArr = Array.isArray(yAxis) ? yAxis : [yAxis];
    return yAxisArr.map((axis, index) => ({
      field: axis.field,
      name: axis.label || axis.field,
      color: colors[index % colors.length],
    }));
  }, [series, yAxis, colors]);

  // Transform data for charts
  const chartData = useMemo(() => {
    return data.map((row) => ({
      ...row,
      _xValue: row[xAxis.field],
    }));
  }, [data, xAxis.field]);

  // Common components
  const commonXAxis = (
    <XAxis
      dataKey="_xValue"
      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
      tickLine={{ stroke: 'var(--border-light)' }}
      axisLine={{ stroke: 'var(--border-light)' }}
      label={
        xAxis.label
          ? { value: xAxis.label, position: 'bottom', offset: -5, fontSize: 12 }
          : undefined
      }
    />
  );

  const commonYAxis = (
    <YAxis
      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
      tickLine={{ stroke: 'var(--border-light)' }}
      axisLine={{ stroke: 'var(--border-light)' }}
      tickFormatter={(value) =>
        formatValue(value, Array.isArray(yAxis) ? yAxis[0]?.format : yAxis.format)
      }
    />
  );

  const commonGrid = showGrid ? (
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" opacity={0.5} />
  ) : null;

  const commonLegend = legend.show ? (
    <Legend
      verticalAlign={
        legend.position === 'top' || legend.position === 'bottom' ? legend.position : 'bottom'
      }
      align={legend.position === 'left' || legend.position === 'right' ? legend.position : 'center'}
      wrapperStyle={{ fontSize: 12 }}
    />
  ) : null;

  const commonTooltip = tooltip.show ? (
    <Tooltip content={<CustomTooltip xAxisConfig={xAxis} yAxisConfig={yAxis} />} />
  ) : null;

  // Render different chart types
  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={chartData}>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Bar
                key={axis.field}
                dataKey={axis.field}
                name={axis.name}
                fill={axis.color || colors[index % colors.length]}
                stackId={stacked ? 'stack' : undefined}
                isAnimationActive={animate}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={chartData}>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Line
                key={axis.field}
                type="monotone"
                dataKey={axis.field}
                name={axis.name}
                stroke={axis.color || colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                isAnimationActive={animate}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={chartData}>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Area
                key={axis.field}
                type="monotone"
                dataKey={axis.field}
                name={axis.name}
                fill={axis.color || colors[index % colors.length]}
                stroke={axis.color || colors[index % colors.length]}
                fillOpacity={0.3}
                stackId={stacked ? 'stack' : undefined}
                isAnimationActive={animate}
              />
            ))}
          </AreaChart>
        );

      case 'pie': {
        const pieData = chartData.map((item, index) => ({
          name: String(item._xValue),
          value: Number(item[yAxes[0]?.field] || 0),
          fill: colors[index % colors.length],
        }));

        return (
          <PieChart>
            {commonTooltip}
            {commonLegend}
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={Math.min(height * 0.35, 120)}
              innerRadius={Math.min(height * 0.15, 50)}
              isAnimationActive={animate}
              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        );
      }

      case 'scatter':
        return (
          <ScatterChart>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Scatter
                key={axis.field}
                name={axis.name}
                data={chartData}
                fill={axis.color || colors[index % colors.length]}
                isAnimationActive={animate}
              />
            ))}
          </ScatterChart>
        );

      case 'composed': {
        return (
          <ComposedChart data={chartData}>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => {
              const seriesType = series?.[index]?.type || 'bar';
              const color = axis.color || colors[index % colors.length];

              if (seriesType === 'line') {
                return (
                  <Line
                    key={axis.field}
                    type="monotone"
                    dataKey={axis.field}
                    name={axis.name}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={animate}
                  />
                );
              }

              if (seriesType === 'area') {
                return (
                  <Area
                    key={axis.field}
                    type="monotone"
                    dataKey={axis.field}
                    name={axis.name}
                    fill={color}
                    stroke={color}
                    fillOpacity={0.3}
                    stackId={stacked ? 'stack' : undefined}
                    isAnimationActive={animate}
                  />
                );
              }

              return (
                <Bar
                  key={axis.field}
                  dataKey={axis.field}
                  name={axis.name}
                  fill={color}
                  stackId={stacked ? 'stack' : undefined}
                  isAnimationActive={animate}
                  radius={[4, 4, 0, 0]}
                />
              );
            })}
          </ComposedChart>
        );
      }

      case 'radar': {
        // Use all data points - the radar chart will handle the rendering
        // Consider filtering server-side if there are too many categories
        return (
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="80%">
            <PolarGrid stroke="var(--border-light)" />
            <PolarAngleAxis
              dataKey="_xValue"
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
            />
            <PolarRadiusAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Radar
                key={axis.field}
                name={axis.name}
                dataKey={axis.field}
                stroke={axis.color || colors[index % colors.length]}
                fill={axis.color || colors[index % colors.length]}
                fillOpacity={0.3}
                isAnimationActive={animate}
              />
            ))}
          </RadarChart>
        );
      }

      default:
        return (
          <BarChart data={chartData}>
            {commonGrid}
            {commonXAxis}
            {commonYAxis}
            {commonTooltip}
            {commonLegend}
            {yAxes.map((axis, index) => (
              <Bar
                key={axis.field}
                dataKey={axis.field}
                name={axis.name}
                fill={axis.color || colors[index % colors.length]}
                isAnimationActive={animate}
              />
            ))}
          </BarChart>
        );
    }
  };

  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border-light bg-surface-secondary ${className}`}
        style={{ width, height }}
      >
        <p className="text-sm text-text-secondary">No data available</p>
      </div>
    );
  }

  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
