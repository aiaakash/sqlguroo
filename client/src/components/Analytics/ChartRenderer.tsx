import React, { useMemo } from 'react';
import type { TQueryColumn } from 'librechat-data-provider';

interface ChartRendererProps {
  type: 'bar' | 'line' | 'pie';
  columns: TQueryColumn[];
  rows: Record<string, unknown>[];
}

// Color palette for charts
const CHART_COLORS = [
  '#8b5cf6', // violet-500
  '#6366f1', // indigo-500
  '#3b82f6', // blue-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
];

export default function ChartRenderer({ type, columns, rows }: ChartRendererProps) {
  // Identify label and value columns
  const { labelColumn, valueColumns } = useMemo(() => {
    const stringCol = columns.find(
      (col) => /char|text|string|varchar|enum/i.test(col.type),
    );
    const numericCols = columns.filter((col) =>
      /int|float|double|decimal|number|bigint/i.test(col.type),
    );

    return {
      labelColumn: stringCol || columns[0],
      valueColumns: numericCols.length > 0 ? numericCols : [columns[columns.length - 1]],
    };
  }, [columns]);

  // Process data for charts
  const chartData = useMemo(() => {
    return rows.map((row) => ({
      label: String(row[labelColumn.name] ?? 'Unknown'),
      values: valueColumns.map((col) => Number(row[col.name]) || 0),
    }));
  }, [rows, labelColumn, valueColumns]);

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    return Math.max(...chartData.flatMap((d) => d.values), 1);
  }, [chartData]);

  // Calculate total for pie chart
  const total = useMemo(() => {
    if (type !== 'pie') return 0;
    return chartData.reduce((sum, d) => sum + (d.values[0] || 0), 0);
  }, [chartData, type]);

  if (type === 'bar') {
    return (
      <div className="space-y-2">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-24 truncate text-right text-xs text-text-secondary" title={item.label}>
              {item.label}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                {item.values.map((value, vIndex) => (
                  <div
                    key={vIndex}
                    className="h-6 rounded transition-all duration-300"
                    style={{
                      width: `${(value / maxValue) * 100}%`,
                      minWidth: value > 0 ? '4px' : '0',
                      backgroundColor: CHART_COLORS[vIndex % CHART_COLORS.length],
                    }}
                    title={`${valueColumns[vIndex].name}: ${value.toLocaleString()}`}
                  />
                ))}
              </div>
            </div>
            <div className="w-20 text-right text-xs text-text-primary">
              {item.values.map((v) => v.toLocaleString()).join(', ')}
            </div>
          </div>
        ))}
        {valueColumns.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-4">
            {valueColumns.map((col, index) => (
              <div key={col.name} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-xs text-text-secondary">{col.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'line') {
    // Simple SVG line chart
    const width = 600;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (index: number) => padding.left + (index / (chartData.length - 1 || 1)) * chartWidth;
    const yScale = (value: number) =>
      padding.top + chartHeight - (value / maxValue) * chartHeight;

    return (
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="mx-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={yScale(maxValue * ratio)}
                x2={width - padding.right}
                y2={yScale(maxValue * ratio)}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4"
              />
              <text
                x={padding.left - 5}
                y={yScale(maxValue * ratio)}
                textAnchor="end"
                alignmentBaseline="middle"
                className="fill-current text-[10px] text-text-tertiary"
              >
                {(maxValue * ratio).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          ))}

          {/* Lines */}
          {valueColumns.map((col, colIndex) => {
            const points = chartData
              .map((d, i) => `${xScale(i)},${yScale(d.values[colIndex])}`)
              .join(' ');

            return (
              <g key={col.name}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={CHART_COLORS[colIndex % CHART_COLORS.length]}
                  strokeWidth={2}
                />
                {/* Points */}
                {chartData.map((d, i) => (
                  <circle
                    key={i}
                    cx={xScale(i)}
                    cy={yScale(d.values[colIndex])}
                    r={4}
                    fill={CHART_COLORS[colIndex % CHART_COLORS.length]}
                  >
                    <title>
                      {d.label}: {d.values[colIndex].toLocaleString()}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* X-axis labels */}
          {chartData.map((d, i) => (
            <text
              key={i}
              x={xScale(i)}
              y={height - 10}
              textAnchor="middle"
              className="fill-current text-[10px] text-text-secondary"
            >
              {d.label.length > 10 ? d.label.slice(0, 10) + '...' : d.label}
            </text>
          ))}
        </svg>
        {valueColumns.length > 1 && (
          <div className="mt-2 flex justify-center gap-4">
            {valueColumns.map((col, index) => (
              <div key={col.name} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-xs text-text-secondary">{col.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'pie') {
    // Simple SVG pie chart
    const size = 200;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 80;

    let currentAngle = -Math.PI / 2; // Start from top

    const slices = chartData.map((item, index) => {
      const value = item.values[0] || 0;
      const angle = (value / total) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      const pathD = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      return {
        path: pathD,
        color: CHART_COLORS[index % CHART_COLORS.length],
        label: item.label,
        value,
        percentage: ((value / total) * 100).toFixed(1),
      };
    });

    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <svg width={size} height={size}>
          {slices.map((slice, index) => (
            <path
              key={index}
              d={slice.path}
              fill={slice.color}
              className="hover:opacity-80"
            >
              <title>
                {slice.label}: {slice.value.toLocaleString()} ({slice.percentage}%)
              </title>
            </path>
          ))}
        </svg>
        <div className="flex flex-col gap-2">
          {slices.map((slice, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-xs text-text-secondary">
                {slice.label}: {slice.value.toLocaleString()} ({slice.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

