import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart,
  Hexagon,
  Save,
  Loader2,
  RefreshCw,
  Database,
  Palette,
  Settings2,
  Axis3D,
  Eye,
  Check,
  ChevronDown,
  History,
  AlertCircle,
} from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import {
  useGetChartWithDataQuery,
  useUpdateChartMutation,
  useRefreshChartDataMutation,
} from 'librechat-data-provider';
import RechartsRenderer, { ChartConfig, ChartType } from './RechartsRenderer';
import { cn } from '~/utils';

interface ChartEditorModalProps {
  chartId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Chart type options
const CHART_TYPES: {
  type: ChartType;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { type: 'bar', label: 'Bar', icon: BarChart3, description: 'Compare values across categories' },
  { type: 'line', label: 'Line', icon: LineChart, description: 'Show trends over time' },
  { type: 'area', label: 'Area', icon: AreaChart, description: 'Emphasize volume beneath trends' },
  { type: 'pie', label: 'Pie', icon: PieChart, description: 'Show part-to-whole relationships' },
  { type: 'scatter', label: 'Scatter', icon: ScatterChart, description: 'Reveal correlations' },
  { type: 'radar', label: 'Radar', icon: Hexagon, description: 'Compare multivariate data' },
];

// Curated color palettes
const COLOR_PALETTES = [
  {
    name: 'Studio',
    colors: ['#FF5A5A', '#00D9C0', '#0099E6', '#7ED321', '#F5A623'],
    accent: '#FF5A5A',
  },
  {
    name: 'Neon',
    colors: ['#FF006E', '#8338EC', '#3A86FF', '#06FFB4', '#FFBE0B'],
    accent: '#FF006E',
  },
  {
    name: 'Terra',
    colors: ['#E63946', '#F77F00', '#FCBF49', '#06A77D', '#118AB2'],
    accent: '#E63946',
  },
  {
    name: 'Ocean',
    colors: ['#0077B6', '#00B4D8', '#90E0EF', '#48CAE4', '#023E8A'],
    accent: '#0077B6',
  },
  {
    name: 'Forest',
    colors: ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#1B4332'],
    accent: '#2D6A4F',
  },
  {
    name: 'Berry',
    colors: ['#9B2226', '#AE2012', '#BB3E03', '#CA6702', '#EE9B00'],
    accent: '#9B2226',
  },
  {
    name: 'Mono',
    colors: ['#212529', '#495057', '#6C757D', '#ADB5BD', '#DEE2E6'],
    accent: '#212529',
  },
];

// Section header component
const SectionHeader: React.FC<{ icon: React.ElementType; label: string }> = ({
  icon: Icon,
  label,
}) => (
  <div className="mb-3 flex items-center gap-2">
    <Icon className="icon-sm text-text-secondary" strokeWidth={2} />
    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
      {label}
    </span>
  </div>
);

// Custom select component
const CustomSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; type?: string }[];
}> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-text-primary transition-all hover:border-border-medium hover:bg-surface-secondary"
      >
        <span>{selected?.label}</span>
        <ChevronDown
          className={cn('icon-sm text-text-secondary transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-border-light bg-surface-primary shadow-xl">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors',
                  value === option.value
                    ? 'bg-surface-active text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover',
                )}
              >
                <span>{option.label}</span>
                {option.type && (
                  <span className="text-[10px] text-text-secondary">{option.type}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default function ChartEditorModal({ chartId, open, onOpenChange }: ChartEditorModalProps) {
  // Fetch chart data
  const {
    data: chartData,
    isLoading,
    error,
    refetch,
  } = useGetChartWithDataQuery(chartId, {
    enabled: open && !!chartId,
  });

  const updateChartMutation = useUpdateChartMutation();
  const refreshChartMutation = useRefreshChartDataMutation();

  // Check if chart has queryRef for refresh capability
  const canRefresh = useMemo(() => {
    return chartData?.chart?.queryRef?.sql && chartData?.chart?.queryRef?.connectionId;
  }, [chartData]);

  // Handle refresh - re-run the SQL query to get fresh data
  const handleRefresh = useCallback(async () => {
    if (!canRefresh) return;
    try {
      await refreshChartMutation.mutateAsync(chartId);
      refetch();
    } catch (error) {
      console.error('Failed to refresh chart data:', error);
    }
  }, [chartId, canRefresh, refreshChartMutation, refetch]);

  // Chart configuration state
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisField, setXAxisField] = useState<string>('');
  const [yAxisFields, setYAxisFields] = useState<string[]>([]);
  const [selectedPalette, setSelectedPalette] = useState(0);
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [stacked, setStacked] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'configure' | 'data'>('configure');

  // Initialize state from fetched chart
  useEffect(() => {
    if (chartData?.chart) {
      const chart = chartData.chart;
      setChartName(chart.name);
      setChartDescription(chart.description || '');
      setChartType(chart.config.type as ChartType);
      setXAxisField(chart.config.xAxis.field);

      const yAxes = Array.isArray(chart.config.yAxis) ? chart.config.yAxis : [chart.config.yAxis];
      setYAxisFields(yAxes.map((y) => y.field));

      setShowLegend(chart.config.legend?.show ?? true);
      setShowGrid(chart.config.showGrid ?? true);
      setStacked(chart.config.stacked ?? false);

      // Find matching color palette using robust array comparison
      if (chart.config.colors && chart.config.colors.length > 0) {
        const paletteIndex = COLOR_PALETTES.findIndex((p) => {
          // Compare first 4 colors with case-insensitive matching
          const paletteColors = p.colors.slice(0, 4);
          const chartColors = chart.config.colors?.slice(0, 4) || [];

          if (paletteColors.length !== chartColors.length) return false;

          return paletteColors.every(
            (color, i) => color.toLowerCase() === (chartColors[i] || '').toLowerCase(),
          );
        });
        if (paletteIndex >= 0) setSelectedPalette(paletteIndex);
      }

      setHasChanges(false);
    }
  }, [chartData]);

  // Track changes
  useEffect(() => {
    if (chartData?.chart) {
      setHasChanges(true);
    }
  }, [
    chartType,
    xAxisField,
    yAxisFields,
    selectedPalette,
    showLegend,
    showGrid,
    stacked,
    chartName,
    chartDescription,
  ]);

  // Get headers from data
  const headers = useMemo(() => {
    return chartData?.data?.columns?.map((c) => c.name) || [];
  }, [chartData]);

  // Get column types
  const columnTypes = useMemo(() => {
    const types: Record<string, string> = {};
    chartData?.data?.columns?.forEach((c) => {
      types[c.name] = c.type;
    });
    return types;
  }, [chartData]);

  // Transform data for chart
  const chartDisplayData = useMemo(() => {
    if (!chartData?.data?.rows || !xAxisField) return [];
    return chartData.data.rows.map((row) => {
      const dataPoint: Record<string, unknown> = {
        [xAxisField]: row[xAxisField],
      };
      yAxisFields.forEach((field) => {
        dataPoint[field] = row[field];
      });
      return dataPoint;
    });
  }, [chartData, xAxisField, yAxisFields]);

  // Build chart config
  const chartConfig: ChartConfig = useMemo(() => {
    return {
      type: chartType,
      xAxis: {
        field: xAxisField,
        label: xAxisField,
        type: (columnTypes[xAxisField] as 'number' | 'category' | 'date') || 'category',
      },
      yAxis: yAxisFields.map((field) => ({
        field,
        label: field,
        type: (columnTypes[field] as 'number' | 'category' | 'date') || 'number',
      })),
      colors: COLOR_PALETTES[selectedPalette].colors,
      legend: { show: showLegend, position: 'bottom' as const },
      showGrid,
      stacked,
      animate: true,
    };
  }, [
    chartType,
    xAxisField,
    yAxisFields,
    columnTypes,
    selectedPalette,
    showLegend,
    showGrid,
    stacked,
  ]);

  // Handle Y-axis field toggle
  const toggleYAxisField = useCallback((field: string) => {
    setYAxisFields((prev) => {
      if (prev.includes(field)) {
        return prev.filter((f) => f !== field);
      }
      return [...prev, field];
    });
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await updateChartMutation.mutateAsync({
        chartId,
        data: {
          name: chartName.trim(),
          description: chartDescription.trim() || undefined,
          config: chartConfig,
        },
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save chart:', error);
    }
  }, [chartId, chartName, chartDescription, chartConfig, updateChartMutation]);

  // Handle close with discard confirmation
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && hasChanges) {
        setPendingCloseAction(() => () => onOpenChange(false));
        setShowDiscardDialog(true);
      } else {
        onOpenChange(newOpen);
      }
    },
    [hasChanges, onOpenChange],
  );

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardDialog(false);
    if (pendingCloseAction) {
      pendingCloseAction();
    }
    setPendingCloseAction(null);
  }, [pendingCloseAction]);

  const handleCancelDiscard = useCallback(() => {
    setShowDiscardDialog(false);
    setPendingCloseAction(null);
  }, []);

  const currentPalette = COLOR_PALETTES[selectedPalette];

  if (isLoading) {
    return (
      <OGDialog open={open} onOpenChange={onOpenChange}>
        <OGDialogContent
          className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col border-border-heavy bg-surface-secondary p-0 shadow-2xl"
          title="Loading..."
        >
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2
                className="h-8 w-8 animate-spin"
                style={{ color: currentPalette.colors[0] }}
              />
              <p className="text-sm text-text-secondary">Loading chart data...</p>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    );
  }

  if (error || !chartData) {
    return (
      <OGDialog open={open} onOpenChange={onOpenChange}>
        <OGDialogContent
          className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col border-border-heavy bg-surface-secondary p-0 shadow-2xl"
          title="Error"
        >
          <div className="flex flex-1 flex-col items-center justify-center p-8">
            <AlertCircle className="mb-3 h-10 w-10 text-surface-destructive" />
            <p className="text-text-secondary">Failed to load chart</p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-surface-primary transition-colors hover:opacity-90"
            >
              Retry
            </button>
          </div>
        </OGDialogContent>
      </OGDialog>
    );
  }

  return (
    <>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent
          className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col overflow-hidden border-border-heavy bg-surface-secondary p-0 shadow-2xl"
          title={chartName || 'Edit Chart'}
          showCloseButton={false}
        >
          {/* Header */}
          <OGDialogHeader className="bg-surface-secondary/50 flex-shrink-0 border-b border-border-light px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${currentPalette.colors[0]}20, ${currentPalette.colors[1]}20)`,
                    border: `1px solid ${currentPalette.colors[0]}40`,
                  }}
                >
                  <BarChart3 className="h-5 w-5" style={{ color: currentPalette.colors[0] }} />
                </div>
                <div>
                  <OGDialogTitle className="text-lg font-semibold text-text-primary">
                    {chartName}
                  </OGDialogTitle>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>Edit Chart</span>
                    {chartData.data.fromCache && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-border-medium" />
                        <span className="flex items-center gap-1">
                          <History className="h-3 w-3" />
                          Cached
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {canRefresh && (
                  <button
                    onClick={handleRefresh}
                    disabled={refreshChartMutation.isLoading}
                    className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-sm text-text-secondary transition-all hover:border-border-medium hover:text-text-primary disabled:opacity-50"
                    title="Refresh data from database"
                  >
                    {refreshChartMutation.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || updateChartMutation.isLoading}
                  className="group relative flex items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50"
                  style={{
                    background: !hasChanges
                      ? '#9CA3AF'
                      : `linear-gradient(135deg, ${currentPalette.colors[0]}, ${currentPalette.colors[1]})`,
                  }}
                >
                  {updateChartMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </OGDialogHeader>

          <div className="relative flex min-h-0 flex-1">
            {/* Left Sidebar - Configuration */}
            <div className="bg-surface-secondary/30 flex w-72 flex-col border-r border-border-light">
              {/* Tab Navigation */}
              <div className="flex border-b border-border-light">
                <button
                  onClick={() => setActiveTab('configure')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium uppercase tracking-wider transition-all',
                    activeTab === 'configure'
                      ? 'border-b-2 border-text-primary text-text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Configure
                </button>
                <button
                  onClick={() => setActiveTab('data')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium uppercase tracking-wider transition-all',
                    activeTab === 'data'
                      ? 'border-b-2 border-text-primary text-text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Database className="h-3.5 w-3.5" />
                  Data
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'configure' ? (
                  <div className="space-y-6">
                    {/* Name & Description */}
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                          Chart Name
                        </label>
                        <input
                          type="text"
                          value={chartName}
                          onChange={(e) => setChartName(e.target.value)}
                          className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-border-xheavy focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                          Description
                        </label>
                        <textarea
                          value={chartDescription}
                          onChange={(e) => setChartDescription(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-border-xheavy focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Chart Type */}
                    <div>
                      <SectionHeader icon={BarChart3} label="Visualization" />
                      <div className="grid grid-cols-2 gap-2">
                        {CHART_TYPES.map(({ type, label, icon: Icon, description }) => (
                          <button
                            key={type}
                            onClick={() => setChartType(type)}
                            className={cn(
                              'group relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all',
                              chartType === type
                                ? 'border-border-xheavy bg-surface-active'
                                : 'border-border-light bg-surface-primary hover:border-border-medium hover:bg-surface-hover',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4 transition-colors',
                                chartType === type
                                  ? 'text-text-primary'
                                  : 'text-text-secondary group-hover:text-text-primary',
                              )}
                            />
                            <div>
                              <div
                                className={cn(
                                  'text-xs font-medium',
                                  chartType === type ? 'text-text-primary' : 'text-text-secondary',
                                )}
                              >
                                {label}
                              </div>
                              <div className="mt-0.5 text-[10px] leading-tight text-text-secondary">
                                {description}
                              </div>
                            </div>
                            {chartType === type && (
                              <div className="absolute right-2 top-2">
                                <Check className="icon-xs text-text-primary" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Axes Configuration */}
                    <div>
                      <SectionHeader icon={Axis3D} label="Axes" />
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                            X-Axis (Category)
                          </label>
                          <CustomSelect
                            value={xAxisField}
                            onChange={setXAxisField}
                            options={headers.map((header) => ({
                              value: header,
                              label: header,
                              type: columnTypes[header],
                            }))}
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                            Y-Axis (Values)
                          </label>
                          <div className="space-y-1">
                            {headers
                              .filter((h) => h !== xAxisField)
                              .map((header) => {
                                const isSelected = yAxisFields.includes(header);
                                return (
                                  <button
                                    key={header}
                                    onClick={() => toggleYAxisField(header)}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all',
                                      isSelected
                                        ? 'border-border-xheavy bg-surface-active text-text-primary'
                                        : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:bg-surface-hover',
                                    )}
                                  >
                                    <span className="text-xs">{header}</span>
                                    {isSelected && <Check className="icon-xs" />}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Color Palette */}
                    <div>
                      <SectionHeader icon={Palette} label="Color System" />
                      <div className="space-y-2">
                        {COLOR_PALETTES.map((palette, index) => (
                          <button
                            key={palette.name}
                            onClick={() => setSelectedPalette(index)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border p-2.5 transition-all',
                              selectedPalette === index
                                ? 'border-border-xheavy bg-surface-secondary'
                                : 'border-transparent hover:border-border-light hover:bg-surface-secondary',
                            )}
                          >
                            <div className="flex -space-x-1.5">
                              {palette.colors.slice(0, 4).map((color, i) => (
                                <div
                                  key={i}
                                  className="h-5 w-5 rounded-full border-2 border-surface-primary"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <span
                              className={cn(
                                'text-xs font-medium',
                                selectedPalette === index
                                  ? 'text-text-primary'
                                  : 'text-text-secondary',
                              )}
                            >
                              {palette.name}
                            </span>
                            {selectedPalette === index && (
                              <Check className="icon-sm ml-auto text-text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Options */}
                    <div>
                      <SectionHeader icon={Settings2} label="Options" />
                      <div className="space-y-2">
                        {[
                          {
                            key: 'legend',
                            label: 'Show Legend',
                            value: showLegend,
                            set: setShowLegend,
                          },
                          { key: 'grid', label: 'Show Grid', value: showGrid, set: setShowGrid },
                          ...(chartType === 'bar' || chartType === 'area'
                            ? [
                                {
                                  key: 'stacked',
                                  label: 'Stack Values',
                                  value: stacked,
                                  set: setStacked,
                                },
                              ]
                            : []),
                        ].map((option) => (
                          <button
                            key={option.key}
                            onClick={() => option.set(!option.value)}
                            className="flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm transition-all hover:border-border-medium"
                          >
                            <span className="text-xs text-text-secondary">{option.label}</span>
                            <div
                              className={cn(
                                'flex h-4 w-7 items-center rounded-full transition-colors',
                                option.value ? 'bg-text-primary' : 'bg-surface-tertiary',
                              )}
                            >
                              <div
                                className={cn(
                                  'h-3 w-3 rounded-full bg-surface-primary transition-transform',
                                  option.value ? 'translate-x-3.5' : 'translate-x-0.5',
                                )}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Data Tab */
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border-light bg-surface-primary p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs text-text-secondary">
                        <Database className="h-3.5 w-3.5" />
                        <span>Data Preview</span>
                        <span className="ml-auto text-[10px] text-text-secondary-alt">
                          {chartData.data.rowCount} rows
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-border-light">
                              {headers.map((header) => (
                                <th
                                  key={header}
                                  className="pb-2 text-left font-medium text-text-secondary"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {chartData.data.rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-b border-border-light last:border-0">
                                {headers.map((header, j) => (
                                  <td key={j} className="py-2 text-text-secondary">
                                    {String(row[header])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {chartData.data.rowCount > 5 && (
                        <div className="mt-2 text-center text-[10px] text-text-secondary-alt">
                          + {chartData.data.rowCount - 5} more rows
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                        Column Types
                      </div>
                      {chartData.data.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2"
                        >
                          <span className="text-xs text-text-secondary">{col.name}</span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                              col.type === 'number' && 'bg-surface-submit/10 text-surface-submit',
                              col.type === 'date' &&
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              col.type === 'string' && 'bg-surface-active-alt text-text-secondary',
                            )}
                          >
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Preview Area */}
            <div className="flex min-h-0 flex-1 flex-col bg-surface-primary-alt">
              {/* Preview Header */}
              <div className="flex items-center justify-between border-b border-border-light px-6 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-text-secondary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                    Live Preview
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span>{chartDisplayData.length} data points</span>
                  <span className="h-1 w-1 rounded-full bg-border-medium" />
                  <span>{yAxisFields.length} series</span>
                  {hasChanges && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-border-medium" />
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                        Unsaved changes
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Chart Preview */}
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                {yAxisFields.length > 0 ? (
                  <div className="w-full max-w-3xl">
                    <RechartsRenderer
                      config={chartConfig}
                      data={chartDisplayData}
                      height={400}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <div
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${currentPalette.colors[0]}10, ${currentPalette.colors[1]}10)`,
                        border: `1px dashed ${currentPalette.colors[0]}40`,
                      }}
                    >
                      <BarChart3
                        className="h-8 w-8"
                        style={{ color: `${currentPalette.colors[0]}60` }}
                      />
                    </div>
                    <p className="text-sm font-medium text-text-secondary">No data to visualize</p>
                    <p className="mt-1 text-xs text-text-secondary-alt">
                      Select at least one Y-axis field
                    </p>
                  </div>
                )}
              </div>

              {/* Data Strip */}
              <div className="bg-surface-secondary/50 flex-shrink-0 border-t border-border-light px-6 py-3">
                <div className="flex items-center gap-6 overflow-x-auto text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">X-Axis:</span>
                    <span className="font-medium text-text-primary">{xAxisField || '—'}</span>
                  </div>
                  <div className="h-3 w-px bg-border-light" />
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">Y-Axis:</span>
                    <span className="font-medium text-text-primary">
                      {yAxisFields.join(', ') || '—'}
                    </span>
                  </div>
                  <div className="h-3 w-px bg-border-light" />
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">Type:</span>
                    <span className="font-medium text-text-primary">
                      {CHART_TYPES.find((t) => t.type === chartType)?.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* Discard Changes Confirmation Dialog */}
      <OGDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <OGDialogContent className="sm:max-w-md">
          <OGDialogHeader>
            <OGDialogTitle>Unsaved Changes</OGDialogTitle>
          </OGDialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-text-secondary">
              You have unsaved changes. Are you sure you want to discard them?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelDiscard}
                className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
              >
                Keep Editing
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
