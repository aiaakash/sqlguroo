import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart,
  Hexagon,
  X,
  Save,
  Loader2,
  Database,
  Palette,
  Settings2,
  Axis3D,
  Eye,
  Check,
  ChevronDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Type,
} from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import RechartsRenderer, { ChartConfig, ChartType } from './RechartsRenderer';
import { useCreateChartMutation } from 'librechat-data-provider';
import { cn } from '~/utils';

interface TableData {
  headers: string[];
  rows: string[][];
}

interface ChartBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableData: TableData;
  queryRef?: {
    connectionId?: string;
    sql?: string;
    queryHash?: string;
    messageId?: string;
    conversationId?: string;
  };
}

// Chart type options with icons
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
  {
    type: 'composed',
    label: 'Composed',
    icon: BarChart3,
    description: 'Combine multiple chart types',
  },
];

// Curated color palettes - each with a distinct personality
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

// Detect column type from data
const detectColumnType = (values: string[]): 'number' | 'category' | 'date' => {
  const nonEmpty = values.filter((v) => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'category';

  const allNumbers = nonEmpty.every((v) => !isNaN(Number(v)) && v.trim() !== '');
  if (allNumbers) return 'number';

  const datePatterns = [/^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{1,2}\s+\w+\s+\d{4}/];
  const looksLikeDate = nonEmpty
    .slice(0, 5)
    .every((v) => datePatterns.some((pattern) => pattern.test(v)));
  if (looksLikeDate) return 'date';

  return 'category';
};

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

export default function ChartBuilderModal({
  open,
  onOpenChange,
  tableData,
  queryRef,
}: ChartBuilderModalProps) {
  const createChartMutation = useCreateChartMutation();

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisField, setXAxisField] = useState<string>('');
  const [yAxisFields, setYAxisFields] = useState<string[]>([]);
  const [selectedPalette, setSelectedPalette] = useState(0);
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [stacked, setStacked] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'configure' | 'data'>('configure');

  // Save form state
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Additional settings
  const [legendPosition, setLegendPosition] = useState<'top' | 'bottom' | 'left' | 'right'>(
    'bottom',
  );
  const [xAxisLabel, setXAxisLabel] = useState<string>('');
  const [yAxisLabels, setYAxisLabels] = useState<Record<string, string>>({});
  const [dataPage, setDataPage] = useState(0);
  const DATA_PAGE_SIZE = 5;

  // Analyze columns
  const columnAnalysis = useMemo(() => {
    return tableData.headers.map((header, index) => {
      const values = tableData.rows.map((row) => row[index]);
      const type = detectColumnType(values);
      return { header, type, index };
    });
  }, [tableData]);

  // Auto-detect best X and Y axes on initial load
  useEffect(() => {
    if (hasInitialized || tableData.headers.length === 0) return;

    const categoryCol = columnAnalysis.find((c) => c.type === 'category' || c.type === 'date');
    const bestXAxis = categoryCol?.header || tableData.headers[0];
    setXAxisField(bestXAxis);

    const numericCols = columnAnalysis.filter((c) => c.type === 'number' && c.header !== bestXAxis);

    if (numericCols.length > 0) {
      setYAxisFields([numericCols[0].header]);
    } else {
      const otherCols = tableData.headers.filter((h) => h !== bestXAxis);
      if (otherCols.length > 0) {
        setYAxisFields([otherCols[0]]);
      }
    }

    setHasInitialized(true);
  }, [columnAnalysis, tableData.headers, hasInitialized]);

  // Track if any configuration has changed
  const [hasChanges, setHasChanges] = useState(false);

  // Track original configuration for comparison
  const [originalConfig, setOriginalConfig] = useState<string>('');

  // Reset state when modal opens with new data
  useEffect(() => {
    if (open && tableData.headers.length > 0) {
      setHasInitialized(false);
      setDataPage(0);
      setValidationError(null);
      setShowSavePanel(false);

      // Reset change tracking
      const initialConfig = JSON.stringify({
        chartType: 'bar',
        xAxisField: '',
        yAxisFields: [],
        selectedPalette: 0,
        showLegend: true,
        showGrid: true,
        stacked: false,
      });
      setOriginalConfig(initialConfig);
      setHasChanges(false);
    }
  }, [open, tableData.headers.length]);

  // Track configuration changes
  useEffect(() => {
    if (!open) return;

    const currentConfig = JSON.stringify({
      chartType,
      xAxisField,
      yAxisFields,
      selectedPalette,
      showLegend,
      showGrid,
      stacked,
    });

    setHasChanges(currentConfig !== originalConfig && originalConfig !== '');
  }, [
    chartType,
    xAxisField,
    yAxisFields,
    selectedPalette,
    showLegend,
    showGrid,
    stacked,
    open,
    originalConfig,
  ]);

  // Transform data for chart
  const chartData = useMemo(() => {
    const xIndex = tableData.headers.indexOf(xAxisField);
    return tableData.rows.map((row) => {
      const dataPoint: Record<string, unknown> = {
        [xAxisField]: row[xIndex],
      };
      yAxisFields.forEach((field) => {
        const yIndex = tableData.headers.indexOf(field);
        const value = row[yIndex];
        dataPoint[field] = !isNaN(Number(value)) ? Number(value) : value;
      });
      return dataPoint;
    });
  }, [tableData, xAxisField, yAxisFields]);

  // Build chart config
  const chartConfig: ChartConfig = useMemo(() => {
    const xColAnalysis = columnAnalysis.find((c) => c.header === xAxisField);

    return {
      type: chartType,
      xAxis: {
        field: xAxisField,
        label: xAxisLabel || xAxisField,
        type: xColAnalysis?.type || 'category',
      },
      yAxis: yAxisFields.map((field) => {
        const colAnalysis = columnAnalysis.find((c) => c.header === field);
        return {
          field,
          label: yAxisLabels[field] || field,
          type: colAnalysis?.type || 'number',
        };
      }),
      colors: COLOR_PALETTES[selectedPalette].colors,
      legend: { show: showLegend, position: legendPosition },
      showGrid,
      stacked,
      animate: true,
    };
  }, [
    chartType,
    xAxisField,
    yAxisFields,
    columnAnalysis,
    selectedPalette,
    showLegend,
    showGrid,
    stacked,
    legendPosition,
    xAxisLabel,
    yAxisLabels,
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

  // When X-axis changes, remove it from Y-axis if present
  useEffect(() => {
    setYAxisFields((prev) => {
      if (xAxisField && prev.includes(xAxisField)) {
        return prev.filter((f) => f !== xAxisField);
      }
      return prev;
    });
  }, [xAxisField]);

  // Handle save
  const handleSave = useCallback(async () => {
    setValidationError(null);

    if (!chartName.trim()) {
      setValidationError('Chart name is required');
      return;
    }

    if (yAxisFields.length === 0) {
      setValidationError('Please select at least one Y-axis field');
      return;
    }

    // All chart types require X-axis for proper labeling
    // Pie charts use X-axis for slice labels, other charts use it for the horizontal axis
    if (!xAxisField) {
      setValidationError('Please select an X-axis field for data labeling');
      return;
    }

    try {
      await createChartMutation.mutateAsync({
        name: chartName.trim(),
        description: chartDescription.trim() || undefined,
        config: chartConfig,
        queryRef: queryRef || undefined,
        dataSnapshot: {
          columns: tableData.headers.map((name) => {
            const analysis = columnAnalysis.find((c) => c.header === name);
            return { name, type: analysis?.type || 'string' };
          }),
          rows: tableData.rows.map((row) => {
            const obj: Record<string, unknown> = {};
            tableData.headers.forEach((header, i) => {
              const analysis = columnAnalysis.find((c) => c.header === header);
              obj[header] = analysis?.type === 'number' ? Number(row[i]) : row[i];
            });
            return obj;
          }),
          rowCount: tableData.rows.length,
        },
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save chart:', error);
      setValidationError('Failed to save chart. Please try again.');
    }
  }, [
    chartName,
    chartDescription,
    xAxisField,
    yAxisFields,
    chartConfig,
    queryRef,
    tableData,
    columnAnalysis,
    createChartMutation,
    onOpenChange,
  ]);

  // Handle close with discard confirmation
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && hasChanges && !showSavePanel) {
        setPendingCloseAction(() => () => onOpenChange(false));
        setShowDiscardDialog(true);
      } else {
        onOpenChange(newOpen);
      }
    },
    [hasChanges, onOpenChange, showSavePanel],
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

  return (
    <>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent
          className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col overflow-hidden border-border-heavy bg-surface-secondary p-0 shadow-2xl"
          title="Chart Studio"
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
                    Chart Studio
                  </OGDialogTitle>
                  <p className="text-xs text-text-secondary">
                    {tableData.rows.length.toLocaleString()} rows × {tableData.headers.length}{' '}
                    columns
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!showSavePanel ? (
                  <>
                    <button
                      onClick={() => setShowSavePanel(true)}
                      className="group relative flex items-center gap-2 overflow-hidden rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-surface-primary transition-all hover:opacity-90"
                    >
                      <div
                        className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10"
                        style={{
                          background: `linear-gradient(135deg, ${currentPalette.colors[0]}, ${currentPalette.colors[1]})`,
                        }}
                      />
                      <Save className="h-4 w-4" />
                      <span>Save Chart</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowSavePanel(false)}
                    className="flex items-center gap-2 rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          </OGDialogHeader>

          <div className="relative flex min-h-0 flex-1">
            {/* Left Sidebar - Configuration */}
            <div
              className={cn(
                'bg-surface-secondary/30 flex flex-col border-r border-border-light transition-all duration-300',
                showSavePanel ? 'w-80' : 'w-72',
              )}
            >
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
                    {chartType !== 'pie' && (
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
                              options={tableData.headers.map((header) => {
                                const analysis = columnAnalysis.find((c) => c.header === header);
                                return {
                                  value: header,
                                  label: header,
                                  type: analysis?.type,
                                };
                              })}
                            />
                            {xAxisField && (
                              <div className="mt-2">
                                <label className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                                  <Type className="h-3 w-3" />
                                  Custom Label
                                </label>
                                <input
                                  type="text"
                                  placeholder={xAxisField}
                                  value={xAxisLabel || ''}
                                  onChange={(e) => setXAxisLabel(e.target.value)}
                                  className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary-alt focus:border-border-xheavy focus:outline-none"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                              Y-Axis (Values)
                            </label>
                            <div className="space-y-1">
                              {tableData.headers
                                .filter((h) => h !== xAxisField)
                                .map((header) => {
                                  const analysis = columnAnalysis.find((c) => c.header === header);
                                  const isSelected = yAxisFields.includes(header);
                                  return (
                                    <div key={header}>
                                      <button
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
                                      {isSelected && (
                                        <div className="mt-2">
                                          <input
                                            type="text"
                                            placeholder={`Label for ${header}`}
                                            value={yAxisLabels[header] || ''}
                                            onChange={(e) =>
                                              setYAxisLabels((prev) => ({
                                                ...prev,
                                                [header]: e.target.value,
                                              }))
                                            }
                  className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary-alt focus:border-border-xheavy focus:outline-none focus:ring-1 focus:ring-ring"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

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
                                  label: chartType === 'area' ? 'Stack Areas' : 'Stack Values',
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
                        {showLegend && (
                          <div className="mt-3">
                            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                              Legend Position
                            </label>
                            <div className="flex gap-1">
                              {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                                <button
                                  key={pos}
                                  onClick={() => setLegendPosition(pos)}
                                  className={cn(
                                    'flex-1 rounded-md border py-1.5 text-[10px] font-medium capitalize transition-all',
                                    legendPosition === pos
                                      ? 'border-border-xheavy bg-surface-active text-text-primary'
                                      : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium',
                                  )}
                                >
                                  {pos}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
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
                          {tableData.rows.length} rows
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-border-light">
                              {tableData.headers.map((header) => (
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
                            {tableData.rows
                              .slice(dataPage * DATA_PAGE_SIZE, (dataPage + 1) * DATA_PAGE_SIZE)
                              .map((row, i) => (
                                <tr key={i} className="border-b border-border-light last:border-0">
                                  {row.map((cell, j) => (
                                    <td key={j} className="py-2 text-text-secondary">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {tableData.rows.length > DATA_PAGE_SIZE && (
                        <div className="mt-2 flex items-center justify-between">
                          <button
                            onClick={() => setDataPage((p) => Math.max(0, p - 1))}
                            disabled={dataPage === 0}
                            className="flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-secondary disabled:opacity-50"
                          >
                            <ChevronLeft className="h-3 w-3" />
                            Prev
                          </button>
                          <span className="text-[10px] text-text-secondary">
                            Page {dataPage + 1} of{' '}
                            {Math.ceil(tableData.rows.length / DATA_PAGE_SIZE)}
                          </span>
                          <button
                            onClick={() =>
                              setDataPage((p) =>
                                Math.min(
                                  Math.ceil(tableData.rows.length / DATA_PAGE_SIZE) - 1,
                                  p + 1,
                                ),
                              )
                            }
                            disabled={
                              dataPage >= Math.ceil(tableData.rows.length / DATA_PAGE_SIZE) - 1
                            }
                            className="flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-secondary disabled:opacity-50"
                          >
                            Next
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                        Column Types
                      </div>
                      <p className="text-[10px] text-text-secondary-alt">
                        Use categories/dates for X-axis and numbers for Y-axis
                      </p>
                      {columnAnalysis.map((col) => (
                        <div
                          key={col.header}
                          className="flex items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2"
                        >
                          <span className="text-xs text-text-secondary">{col.header}</span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                              col.type === 'number' && 'bg-surface-submit/10 text-surface-submit',
                              col.type === 'date' &&
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              col.type === 'category' &&
                                'bg-surface-active-alt text-text-secondary',
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
              {/* Save Panel Overlay */}
              <div
                className={cn(
                  'absolute right-0 top-0 z-20 h-full w-80 transform border-l border-border-light bg-surface-primary shadow-xl transition-transform duration-300',
                  showSavePanel ? 'translate-x-0' : 'translate-x-full',
                )}
              >
                <div className="flex h-full flex-col p-5">
                  <div className="mb-6">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                      <Sparkles className="h-4 w-4" style={{ color: currentPalette.colors[0] }} />
                      Save Visualization
                    </h3>
                    <p className="mt-1 text-xs text-text-secondary">
                      Save your chart configuration to your library
                    </p>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                        Chart Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Revenue by Quarter"
                        value={chartName}
                        onChange={(e) => setChartName(e.target.value)}
                        className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary-alt focus:border-border-xheavy focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                        Description
                      </label>
                      <textarea
                        placeholder="What does this chart represent?"
                        value={chartDescription}
                        onChange={(e) => setChartDescription(e.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary-alt focus:border-border-xheavy focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    <div className="bg-surface-secondary/50 rounded-lg border border-border-light p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                        Configuration Summary
                      </div>
                      <div className="space-y-1.5 text-xs text-text-secondary">
                        <div className="flex justify-between">
                          <span>Type</span>
                          <span className="text-text-primary">
                            {CHART_TYPES.find((t) => t.type === chartType)?.label}
                          </span>
                        </div>
                        {chartType !== 'pie' && (
                          <div className="flex justify-between">
                            <span>X-Axis</span>
                            <span className="text-text-primary">{xAxisField || '—'}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Y-Axis</span>
                          <span className="text-text-primary">{yAxisFields.join(', ') || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Palette</span>
                          <span className="text-text-primary">{currentPalette.name}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {validationError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {validationError}
                    </div>
                  )}

                  <div className="mt-auto space-y-2 pt-4">
                    <button
                      onClick={handleSave}
                      disabled={!chartName.trim() || createChartMutation.isLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
                      style={{
                        background: `linear-gradient(135deg, ${currentPalette.colors[0]}, ${currentPalette.colors[1]})`,
                        opacity: !chartName.trim() || createChartMutation.isLoading ? 0.5 : 1,
                      }}
                    >
                      {createChartMutation.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save to Library
                    </button>
                    <button
                      onClick={() => setShowSavePanel(false)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-light py-2.5 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview Header */}
              <div className="flex items-center justify-between border-b border-border-light px-6 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-text-secondary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">
                    Live Preview
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span>{chartData.length} data points</span>
                  <span className="h-1 w-1 rounded-full bg-border-medium" />
                  <span>{yAxisFields.length} series</span>
                </div>
              </div>

              {/* Chart Preview */}
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                {yAxisFields.length > 0 ? (
                  <div className="w-full max-w-3xl">
                    <RechartsRenderer
                      config={chartConfig}
                      data={chartData}
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
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-all hover:bg-destructive/80"
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
