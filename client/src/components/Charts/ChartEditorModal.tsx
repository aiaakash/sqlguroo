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
  X,
  Sparkles,
} from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  Button,
  Input,
  Textarea,
} from '@librechat/client';
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

const SectionHeader: React.FC<{ icon: React.ElementType; label: string }> = ({
  icon: Icon,
  label,
}) => (
  <div className="mb-3 flex items-center gap-2">
    <Icon className="h-4 w-4 text-text-secondary" strokeWidth={2} />
    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
      {label}
    </span>
  </div>
);

export default function ChartEditorModal({ chartId, open, onOpenChange }: ChartEditorModalProps) {
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

  const canRefresh = useMemo(() => {
    return chartData?.chart?.queryRef?.sql && chartData?.chart?.queryRef?.connectionId;
  }, [chartData]);

  const handleRefresh = useCallback(async () => {
    if (!canRefresh) return;
    try {
      await refreshChartMutation.mutateAsync(chartId);
      refetch();
    } catch (error) {
      console.error('Failed to refresh chart data:', error);
    }
  }, [chartId, canRefresh, refreshChartMutation, refetch]);

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

      if (chart.config.colors && chart.config.colors.length > 0) {
        const paletteIndex = COLOR_PALETTES.findIndex((p) => {
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

  const headers = useMemo(() => {
    return chartData?.data?.columns?.map((c) => c.name) || [];
  }, [chartData]);

  const columnTypes = useMemo(() => {
    const types: Record<string, string> = {};
    chartData?.data?.columns?.forEach((c) => {
      types[c.name] = c.type;
    });
    return types;
  }, [chartData]);

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

  const toggleYAxisField = useCallback((field: string) => {
    setYAxisFields((prev) => {
      if (prev.includes(field)) {
        return prev.filter((f) => f !== field);
      }
      return [...prev, field];
    });
  }, []);

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
          className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col rounded-2xl border-border-light/60 bg-surface-primary p-0 shadow-2xl"
          title="Loading..."
        >
          <div className="flex flex-1 items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Loader2
                  className="h-6 w-6 animate-spin text-primary"
                />
              </div>
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
          className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col rounded-2xl border-border-light/60 bg-surface-primary p-0 shadow-2xl"
          title="Error"
        >
          <div className="flex flex-1 flex-col items-center justify-center p-12">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-sm font-medium text-text-secondary">Failed to load chart</p>
            <Button onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    );
  }

  return (
    <>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent
          className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-2xl border-border-light/60 bg-surface-primary p-0 shadow-2xl"
          title={chartName || 'Edit Chart'}
          showCloseButton={false}
        >
          <OGDialogHeader className="flex-shrink-0 border-b border-border-light/60 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl ring-1"
                  style={{
                    background: `linear-gradient(135deg, ${currentPalette.colors[0]}15, ${currentPalette.colors[1]}15)`,
                    borderColor: `${currentPalette.colors[0]}30`,
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
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshChartMutation.isLoading}
                    title="Refresh data from database"
                    className="gap-2"
                  >
                    {refreshChartMutation.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || updateChartMutation.isLoading}
                  variant="submit"
                  className="group gap-2"
                >
                  {updateChartMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Changes</span>
                </Button>
              </div>
            </div>
          </OGDialogHeader>

            <div className="relative flex min-h-0 flex-1">
              <div className="flex w-64 flex-col border-r border-border-light/60 bg-surface-primary-alt">
              <div className="flex border-b border-border-light/60">
                <button
                  onClick={() => setActiveTab('configure')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-all',
                    activeTab === 'configure'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Settings2 className="h-4 w-4" />
                  Configure
                </button>
                <button
                  onClick={() => setActiveTab('data')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-all',
                    activeTab === 'data'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Database className="h-4 w-4" />
                  Data
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'configure' ? (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                          Chart Name
                        </label>
                        <Input
                          type="text"
                          value={chartName}
                          onChange={(e) => setChartName(e.target.value)}
                          className="w-full rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2.5 text-sm text-text-primary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                          Description
                        </label>
                        <Textarea
                          value={chartDescription}
                          onChange={(e) => setChartDescription(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2.5 text-sm text-text-primary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                    </div>

                    <div>
                      <SectionHeader icon={BarChart3} label="Visualization" />
                      <div className="grid grid-cols-2 gap-2">
                        {CHART_TYPES.map(({ type, label, icon: Icon, description }) => (
                          <button
                            key={type}
                            onClick={() => setChartType(type)}
                            className={cn(
                              'group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                              chartType === type
                                ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                                : 'border-border-light/60 bg-surface-secondary/50 hover:border-border-medium hover:bg-surface-hover',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4 transition-colors',
                                chartType === type
                                  ? 'text-primary'
                                  : 'text-text-secondary group-hover:text-text-primary',
                              )}
                            />
                            <div>
                              <div
                                className={cn(
                                  'text-xs font-semibold',
                                  chartType === type ? 'text-text-primary' : 'text-text-secondary',
                                )}
                              >
                                {label}
                              </div>
                              <div className="mt-0.5 text-[10px] leading-tight text-text-tertiary">
                                {description}
                              </div>
                            </div>
                            {chartType === type && (
                              <div className="absolute right-2 top-2">
                                <Check className="h-3.5 w-3.5 text-primary" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionHeader icon={Axis3D} label="Axes" />
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                            X-Axis (Category)
                          </label>
                          <Select value={xAxisField} onValueChange={setXAxisField}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select X-Axis..." />
                            </SelectTrigger>
                            <SelectContent>
                              {headers.map((header) => (
                                <SelectItem key={header} value={header}>
                                  {header}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                            Y-Axis (Values)
                          </label>
                          <div className="space-y-1.5">
                            {headers
                              .filter((h) => h !== xAxisField)
                              .map((header) => {
                                const isSelected = yAxisFields.includes(header);
                                return (
                                  <button
                                    key={header}
                                    onClick={() => toggleYAxisField(header)}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-all',
                                      isSelected
                                        ? 'border-primary/30 bg-primary/5 font-medium text-text-primary ring-1 ring-primary/10'
                                        : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium hover:bg-surface-hover',
                                    )}
                                  >
                                    <span className="text-xs">{header}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <SectionHeader icon={Palette} label="Color System" />
                      <div className="space-y-2">
                        {COLOR_PALETTES.map((palette, index) => (
                          <button
                            key={palette.name}
                            onClick={() => setSelectedPalette(index)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-xl border p-3 transition-all',
                              selectedPalette === index
                                ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10'
                                : 'border-transparent hover:border-border-light/60 hover:bg-surface-secondary/50',
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
                                'text-xs font-semibold',
                                selectedPalette === index
                                  ? 'text-text-primary'
                                  : 'text-text-secondary',
                              )}
                            >
                              {palette.name}
                            </span>
                            {selectedPalette === index && (
                              <Check className="ml-auto h-4 w-4 text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionHeader icon={Settings2} label="Options" />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-3 transition-all hover:border-border-medium">
                          <span className="text-sm text-text-secondary">Show Legend</span>
                          <Switch
                            checked={showLegend}
                            onCheckedChange={(checked) => setShowLegend(checked)}
                            aria-label="Show Legend"
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-xxl border border-border-light/60 bg-surface-secondary/50 px-4 py-3 transition-all hover:border-border-medium">
                          <span className="text-sm text-text-secondary">Show Grid</span>
                          <Switch
                            checked={showGrid}
                            onCheckedChange={(checked) => setShowGrid(checked)}
                            aria-label="Show Grid"
                          />
                        </div>
                        {(chartType === 'bar' || chartType === 'area') && (
                          <div className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-3 transition-all hover:border-border-medium">
                            <span className="text-sm text-text-secondary">Stack Values</span>
                            <Switch
                              checked={stacked}
                              onCheckedChange={(checked) => setStacked(checked)}
                              aria-label="Stack Values"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-border-light/60 bg-surface-secondary/50">
                      <div className="flex items-center justify-between border-b border-border-light/60 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                          <Database className="h-4 w-4" />
                          <span>Data Preview</span>
                        </div>
                        <span className="rounded-lg bg-surface-primary px-2 py-1 text-[10px] font-semibold text-text-tertiary ring-1 ring-border-light/50">
                          {chartData.data.rowCount} rows
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border-light/60 bg-surface-primary/50">
                              {headers.map((header) => (
                                <th
                                  key={header}
                                  className="px-4 py-2.5 text-left font-semibold text-text-secondary"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {chartData.data.rows.slice(0, 5).map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-border-light/40 last:border-0"
                              >
                                {headers.map((header, j) => (
                                  <td key={j} className="px-4 py-2 text-text-secondary">
                                    {String(row[header])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {chartData.data.rowCount > 5 && (
                        <div className="border-t border-border-light/60 px-4 py-2 text-center text-[11px] font-medium text-text-tertiary">
                          + {chartData.data.rowCount - 5} more rows
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        Column Types
                      </div>
                      {chartData.data.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-2.5"
                        >
                          <span className="text-xs font-medium text-text-secondary">{col.name}</span>
                          <span
                            className={cn(
                              'rounded-lg px-2 py-1 text-[10px] font-semibold uppercase',
                              col.type === 'number' && 'bg-primary/10 text-primary',
                              col.type === 'date' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
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

            <div className="flex min-h-0 flex-1 flex-col bg-surface-primary-alt">
              <div className="flex items-center justify-between border-b border-border-light/60 px-6 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-text-secondary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                    Live Preview
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="rounded-lg bg-surface-secondary/50 px-2 py-1 ring-1 ring-border-light/50">
                    {chartDisplayData.length} data points
                  </span>
                  <span className="rounded-lg bg-surface-secondary/50 px-2 py-1 ring-1 ring-border-light/50">
                    {yAxisFields.length} series
                  </span>
                  {hasChanges && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      Unsaved
                    </span>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 p-4 lg:p-6">
                {yAxisFields.length > 0 ? (
                  <div className="flex h-full w-full flex-col">
                    <RechartsRenderer
                      config={chartConfig}
                      data={chartDisplayData}
                      height={Math.max(240, (window.innerHeight * 0.42) - 180)}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex w-full max-w-4xl gap-8">
                    <div className="flex flex-1 flex-col items-center justify-center text-center">
                      <div
                        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
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
                      <p className="mt-1 text-xs text-text-tertiary">
                        Select at least one Y-axis field
                      </p>
                    </div>
                    <div className="w-64 flex-shrink-0 rounded-xl border border-border-light/60 bg-surface-secondary/30 p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Quick Tips
                      </h4>
                      <ul className="space-y-2 text-xs text-text-secondary">
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            1
                          </span>
                          <span>Select numeric columns for Y-axis to display values</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            2
                          </span>
                          <span>X-axis is typically a category or date column</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            3
                          </span>
                          <span>Choose chart type based on data relationship</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            4
                          </span>
                          <span>Enable legend to identify multiple series</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 border-t border-border-light/60 bg-surface-primary/50 px-6 py-3">
                <div className="flex items-center gap-4 overflow-x-auto text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">X-Axis:</span>
                    <span className="font-medium text-text-primary">{xAxisField || '—'}</span>
                  </div>
                  <div className="h-4 w-px bg-border-light/60" />
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Y-Axis:</span>
                    <span className="font-medium text-text-primary">
                      {yAxisFields.join(', ') || '—'}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-border-light/60" />
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Type:</span>
                    <span className="rounded-lg bg-surface-secondary/50 px-2 py-0.5 font-medium capitalize text-text-primary ring-1 ring-border-light/50">
                      {CHART_TYPES.find((t) => t.type === chartType)?.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      <OGDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <OGDialogContent className="sm:max-w-md rounded-2xl">
          <OGDialogHeader>
            <OGDialogTitle>Unsaved Changes</OGDialogTitle>
          </OGDialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-text-secondary">
              You have unsaved changes. Are you sure you want to discard them?
            </p>
            <div className="flex justify-end gap-3">
              <Button onClick={handleCancelDiscard} variant="outline">
                Keep Editing
              </Button>
              <Button onClick={handleConfirmDiscard} variant="destructive">
                Discard Changes
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
