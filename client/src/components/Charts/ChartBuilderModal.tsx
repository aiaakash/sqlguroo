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
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  Button,
  Input,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Label,
  Separator,
} from '@librechat/client';
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

  export default function ChartBuilderModal({
  open,
  onOpenChange,
  tableData,
  queryRef,
}: ChartBuilderModalProps) {
  const createChartMutation = useCreateChartMutation();

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisField, setXAxisField] = useState<string>('');
  const [yAxisFields, setYAxisFields] = useState<string[]>([]);
  const [selectedPalette, setSelectedPalette] = useState(0);
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [stacked, setStacked] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'configure' | 'data'>('configure');

  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [legendPosition, setLegendPosition] = useState<'top' | 'bottom' | 'left' | 'right'>(
    'bottom',
  );
  const [xAxisLabel, setXAxisLabel] = useState<string>('');
  const [yAxisLabels, setYAxisLabels] = useState<Record<string, string>>({});
  const [dataPage, setDataPage] = useState(0);
  const DATA_PAGE_SIZE = 5;

  const columnAnalysis = useMemo(() => {
    return tableData.headers.map((header, index) => {
      const values = tableData.rows.map((row) => row[index]);
      const type = detectColumnType(values);
      return { header, type, index };
    });
  }, [tableData]);

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

  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<string>('');

  useEffect(() => {
    if (open && tableData.headers.length > 0) {
      setHasInitialized(false);
      setDataPage(0);
      setValidationError(null);
      setShowSavePanel(false);

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

  const toggleYAxisField = useCallback((field: string) => {
    setYAxisFields((prev) => {
      if (prev.includes(field)) {
        return prev.filter((f) => f !== field);
      }
      return [...prev, field];
    });
  }, []);

  useEffect(() => {
    setYAxisFields((prev) => {
      if (xAxisField && prev.includes(xAxisField)) {
        return prev.filter((f) => f !== xAxisField);
      }
      return prev;
    });
  }, [xAxisField]);

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
          className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden bg-surface-primary p-0"
          title="Chart Studio"
          showCloseButton={false}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-light/60 px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <OGDialogTitle className="text-lg font-semibold leading-none tracking-tight">
                  Chart Studio
                </OGDialogTitle>
                <OGDialogDescription>
                  {tableData.rows.length.toLocaleString()} rows × {tableData.headers.length}{' '}
                  columns
                </OGDialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!showSavePanel ? (
                <Button
                  onClick={() => setShowSavePanel(true)}
                  className="group gap-2"
                  variant="default"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Chart</span>
                </Button>
              ) : (
                <Button
                  onClick={() => setShowSavePanel(false)}
                  variant="outline"
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </Button>
              )}
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1">
            <div
              className={cn(
                'flex flex-col border-r border-border-light/60 bg-surface-primary-alt transition-all duration-300',
                showSavePanel ? 'w-80' : 'w-64',
              )}
            >
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'configure' | 'data')}
                className="flex flex-1 min-h-0 flex-col"
              >
                <TabsList className="flex w-full rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="configure"
                    className="flex flex-1 items-center justify-center gap-2 rounded-none border-b-2 border-transparent py-3 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-all data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-text-primary"
                  >
                    <Settings2 className="h-4 w-4" />
                    Configure
                  </TabsTrigger>
                  <TabsTrigger
                    value="data"
                    className="flex flex-1 items-center justify-center gap-2 rounded-none border-b-2 border-transparent py-3 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-all data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-text-primary"
                  >
                    <Database className="h-4 w-4" />
                    Data
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="configure" className="mt-0 flex-1 overflow-y-auto p-4">
                  <div className="space-y-6">
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

                    {chartType !== 'pie' && (
                      <div>
                        <SectionHeader icon={Axis3D} label="Axes" />
                        <div className="space-y-3">
                           <div>
                             <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                               X-Axis (Category)
                             </Label>
                             <Select value={xAxisField} onValueChange={setXAxisField}>
                               <SelectTrigger className="w-full">
                                 <SelectValue placeholder="Select X-Axis..." />
                               </SelectTrigger>
                               <SelectContent>
                                 {tableData.headers.map((header) => (
                                   <SelectItem key={header} value={header}>
                                     {header}
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                            {xAxisField && (
                              <div className="mt-2">
                                <Label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                                  <Type className="h-3.5 w-3.5" />
                                  Custom Label
                                </Label>
<Input
                                    type="text"
                                    placeholder={xAxisField}
                                    value={xAxisLabel || ''}
                                    onChange={(e) => setXAxisLabel(e.target.value)}
                                    className="w-full rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
                                  />
                              </div>
                            )}
                          </div>

                          <div>
                            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                              Y-Axis (Values)
                            </Label>
                            <div className="space-y-1.5">
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
                                          'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-all',
                                          isSelected
                                            ? 'border-primary/30 bg-primary/5 font-medium text-text-primary ring-1 ring-primary/10'
                                            : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium hover:bg-surface-hover',
                                        )}
                                      >
                                        <span className="text-xs">{header}</span>
                                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                                      </button>
                                      {isSelected && (
                                        <div className="mt-2">
                                          <Input
                                            type="text"
                                            placeholder={`Label for ${header}`}
                                            value={yAxisLabels[header] || ''}
                                            onChange={(e) =>
                                              setYAxisLabels((prev) => ({
                                                ...prev,
                                                [header]: e.target.value,
                                              }))
                                            }
                                            className="w-full rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
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
                        <div className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-3 transition-all hover:border-border-medium">
                          <span className="text-sm text-text-secondary">Show Grid</span>
                          <Switch
                            checked={showGrid}
                            onCheckedChange={(checked) => setShowGrid(checked)}
                            aria-label="Show Grid"
                          />
                        </div>
                        {(chartType === 'bar' || chartType === 'area') && (
                          <div className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-3 transition-all hover:border-border-medium">
                            <span className="text-sm text-text-secondary">{chartType === 'area' ? 'Stack Areas' : 'Stack Values'}</span>
                            <Switch
                              checked={stacked}
                              onCheckedChange={(checked) => setStacked(checked)}
                              aria-label={chartType === 'area' ? 'Stack Areas' : 'Stack Values'}
                            />
                          </div>
                        )}
                        {showLegend && (
                          <div className="mt-3">
                            <Label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                              Legend Position
                            </Label>
                            <div className="flex gap-1.5">
                              {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
                                <button
                                  key={pos}
                                  onClick={() => setLegendPosition(pos)}
                                  className={cn(
                                    'flex-1 rounded-lg border py-2 text-[11px] font-semibold capitalize transition-all',
                                    legendPosition === pos
                                      ? 'border-primary/30 bg-primary/5 text-primary ring-1 ring-primary/10'
                                      : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium',
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
                </TabsContent>
                <TabsContent value="data" className="mt-0 flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-border-light/60 bg-surface-secondary/50">
                      <div className="flex items-center justify-between border-b border-border-light/60 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                          <Database className="h-4 w-4" />
                          <span>Data Preview</span>
                        </div>
                        <span className="rounded-lg bg-surface-primary px-2 py-1 text-[10px] font-semibold text-text-tertiary ring-1 ring-border-light/50">
                          {tableData.rows.length} rows
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border-light/60 bg-surface-primary/50">
                              {tableData.headers.map((header) => (
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
                            {tableData.rows
                              .slice(dataPage * DATA_PAGE_SIZE, (dataPage + 1) * DATA_PAGE_SIZE)
                              .map((row, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-border-light/40 last:border-0"
                                >
                                  {row.map((cell, j) => (
                                    <td key={j} className="px-4 py-2 text-text-secondary">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {tableData.rows.length > DATA_PAGE_SIZE && (
                        <div className="flex items-center justify-between border-t border-border-light/60 px-4 py-2.5">
                          <Button
                            onClick={() => setDataPage((p) => Math.max(0, p - 1))}
                            disabled={dataPage === 0}
                            variant="outline"
                            size="sm"
                            className="gap-1"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Prev
                          </Button>
                          <span className="text-[11px] font-medium text-text-tertiary">
                            Page {dataPage + 1} of{' '}
                            {Math.ceil(tableData.rows.length / DATA_PAGE_SIZE)}
                          </span>
                          <Button
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
                            variant="outline"
                            size="sm"
                            className="gap-1"
                          >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        Column Types
                      </div>
                      <p className="text-[11px] text-text-tertiary">
                        Use categories/dates for X-axis and numbers for Y-axis
                      </p>
                      {columnAnalysis.map((col) => (
                        <div
                          key={col.header}
                          className="flex items-center justify-between rounded-xl border border-border-light/60 bg-surface-secondary/50 px-4 py-2.5"
                        >
                          <span className="text-xs font-medium text-text-secondary">{col.header}</span>
                          <span
                            className={cn(
                              'rounded-lg px-2 py-1 text-[10px] font-semibold uppercase',
                              col.type === 'number' && 'bg-primary/10 text-primary',
                              col.type === 'date' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              col.type === 'category' && 'bg-surface-active-alt text-text-secondary',
                            )}
                          >
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col bg-surface-primary-alt">
              <div
                className={cn(
                  'absolute right-0 top-0 z-20 h-full w-80 transform border-l border-border-light/60 bg-surface-primary shadow-xl transition-transform duration-300',
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
                      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        Chart Name *
                      </Label>
                      <Input
                        type="text"
                        placeholder="e.g., Revenue by Quarter"
                        value={chartName}
                        onChange={(e) => setChartName(e.target.value)}
                        className="w-full rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>

                    <div>
                      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        Description
                      </Label>
                      <Textarea
                        placeholder="What does this chart represent?"
                        value={chartDescription}
                        onChange={(e) => setChartDescription(e.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>

                    <div className="overflow-hidden rounded-xl border border-border-light/60 bg-surface-secondary/50 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        Configuration Summary
                      </div>
                      <div className="space-y-2 text-xs text-text-secondary">
                        <div className="flex items-center justify-between">
                          <span>Type</span>
                          <span className="font-medium text-text-primary">
                            {CHART_TYPES.find((t) => t.type === chartType)?.label}
                          </span>
                        </div>
                        {chartType !== 'pie' && (
                          <div className="flex items-center justify-between">
                            <span>X-Axis</span>
                            <span className="font-medium text-text-primary">{xAxisField || '—'}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span>Y-Axis</span>
                          <span className="font-medium text-text-primary">
                            {yAxisFields.join(', ') || '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Palette</span>
                          <span className="font-medium text-text-primary">{currentPalette.name}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {validationError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
                      {validationError}
                    </div>
                  )}

                  <div className="mt-auto space-y-2 pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={!chartName.trim() || createChartMutation.isLoading}
                      variant="submit"
                      className="w-full gap-2"
                    >
                      {createChartMutation.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save to Library
                    </Button>
                    <Button
                      onClick={() => setShowSavePanel(false)}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-border-light/60 px-6 py-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-text-secondary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                    Live Preview
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="rounded-lg bg-surface-secondary/50 px-2 py-1 ring-1 ring-border-light/50">
                    {chartData.length} data points
                  </span>
                  <span className="rounded-lg bg-surface-secondary/50 px-2 py-1 ring-1 ring-border-light/50">
                    {yAxisFields.length} series
                  </span>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 p-4 lg:p-6">
                {yAxisFields.length > 0 ? (
                  <div className="flex h-full w-full flex-col">
                    <RechartsRenderer
                      config={chartConfig}
                      data={chartData}
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
                  <Separator orientation="vertical" className="h-4 bg-border-light/60" />
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Y-Axis:</span>
                    <span className="font-medium text-text-primary">
                      {yAxisFields.join(', ') || '—'}
                    </span>
                  </div>
                  <Separator orientation="vertical" className="h-4 bg-border-light/60" />
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
