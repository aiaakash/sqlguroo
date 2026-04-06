import React, { useState, useMemo } from 'react';
import { Search, Plus, BarChart3, X, ChevronRight } from 'lucide-react';
import { useGetChartsQuery } from 'librechat-data-provider';
import type { IDashboardChartItem } from 'librechat-data-provider';
import { cn } from '~/utils';
import { CHART_SIZES } from './types';

interface ChartLibrarySidebarProps {
  existingChartIds: string[];
  onAddChart: (chartId: string, size: { w: number; h: number }) => void;
}

export default function ChartLibrarySidebar({
  existingChartIds,
  onAddChart,
}: ChartLibrarySidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState(CHART_SIZES[1]); // Medium

  // Fetch user's charts
  const { data: chartsData, isLoading } = useGetChartsQuery({
    search: searchTerm || undefined,
    pageSize: 100,
  });

  const availableCharts = useMemo(() => {
    const charts = chartsData?.charts || [];
    return charts.filter((chart) => !existingChartIds.includes(chart._id));
  }, [chartsData, existingChartIds]);

  const chartTypeColors: Record<string, string> = {
    bar: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    line: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    area: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pie: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    scatter: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    radar: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  };

  const handleAddChart = () => {
    if (selectedChartId) {
      onAddChart(selectedChartId, { w: selectedSize.w, h: selectedSize.h });
      setSelectedChartId(null);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-r border-border-light bg-surface-secondary dark:border-border-dark dark:bg-surface-secondary-dark">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border-light p-4 dark:border-border-dark">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Chart Library</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search charts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-border-light bg-surface-primary py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-primary-dark"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Chart List */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-hover" />
            ))}
          </div>
        ) : availableCharts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BarChart3 className="mb-2 h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              {existingChartIds.length > 0
                ? 'All your charts are already added'
                : searchTerm
                  ? 'No charts found'
                  : 'No charts in your library'}
            </p>
            {!searchTerm && existingChartIds.length === 0 && (
              <a href="/d/charts" className="mt-2 text-sm text-blue-500 hover:underline">
                Create a chart first
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {availableCharts.map((chart) => (
              <button
                key={chart._id}
                onClick={() => setSelectedChartId(chart._id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
                  selectedChartId === chart._id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-transparent bg-surface-primary hover:bg-surface-hover dark:bg-surface-primary-dark'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border',
                    chartTypeColors[chart.config.type] || 'bg-surface-secondary text-text-secondary'
                  )}
                >
                  <span className="text-xs font-bold uppercase">
                    {chart.config.type.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{chart.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {chart.config.type} • {chart.rowCount} rows
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform',
                    selectedChartId === chart._id && 'rotate-90 text-blue-500'
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Panel */}
      {selectedChartId && (
        <div className="flex-shrink-0 border-t border-border-light p-4 dark:border-border-dark">
          <p className="mb-3 text-xs font-medium uppercase text-text-tertiary">Select Size</p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {CHART_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => setSelectedSize(size)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-medium transition-all',
                  selectedSize.value === size.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : 'border-border-light bg-surface-primary text-text-secondary hover:border-blue-500/50 hover:text-text-primary dark:border-border-dark dark:bg-surface-primary-dark'
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleAddChart}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            Add to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

