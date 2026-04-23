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
  const [selectedSize, setSelectedSize] = useState(CHART_SIZES[1]);

  const { data: chartsData, isLoading } = useGetChartsQuery({
    search: searchTerm || undefined,
    pageSize: 100,
  });

  const availableCharts = useMemo(() => {
    const charts = chartsData?.charts || [];
    return charts.filter((chart) => !existingChartIds.includes(chart._id));
  }, [chartsData, existingChartIds]);

  const handleAddChart = () => {
    if (selectedChartId) {
      onAddChart(selectedChartId, { w: selectedSize.w, h: selectedSize.h });
      setSelectedChartId(null);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-r border-border-light/60 bg-surface-primary-alt">
      <div className="flex-shrink-0 border-b border-border-light/60 p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Chart Library</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search charts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-border-light/60 bg-surface-secondary/50 py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:bg-surface-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary/50" />
            ))}
          </div>
        ) : availableCharts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary/50">
              <BarChart3 className="h-6 w-6 text-text-tertiary" />
            </div>
            <p className="text-sm text-text-secondary">
              {existingChartIds.length > 0
                ? 'All your charts are already added'
                : searchTerm
                  ? 'No charts found'
                  : 'No charts in your library'}
            </p>
            {!searchTerm && existingChartIds.length === 0 && (
              <a href="/d/charts" className="mt-2 text-sm text-primary hover:underline">
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
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                  selectedChartId === chart._id
                    ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                    : 'border-border-light/60 bg-surface-secondary/50 hover:border-border-medium hover:bg-surface-hover'
                )}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
                  <span className="text-xs font-bold uppercase text-primary">
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
                    selectedChartId === chart._id && 'rotate-90 text-primary'
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedChartId && (
        <div className="flex-shrink-0 border-t border-border-light/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Select Size</p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {CHART_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => setSelectedSize(size)}
                className={cn(
                  'rounded-xl border px-2 py-2 text-xs font-medium transition-all',
                  selectedSize.value === size.value
                    ? 'border-primary/30 bg-primary/5 text-primary ring-1 ring-primary/10'
                    : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium hover:text-text-primary'
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleAddChart}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
