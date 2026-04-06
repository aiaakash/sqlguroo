import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  GripVertical,
  X,
  AlertCircle,
  Loader2,
  Move,
  Maximize,
} from 'lucide-react';
import type { IDashboardChartWithData, IDashboardChartItem } from 'librechat-data-provider';
import RechartsRenderer from '~/components/Charts/RechartsRenderer';
import type { ChartConfig } from '~/components/Charts/RechartsRenderer';
import { cn } from '~/utils';

const ITEM_TYPE = 'DASHBOARD_CHART';

interface DragItem {
  chartId: string;
  index: number;
}

interface DashboardGridProps {
  charts: IDashboardChartWithData[];
  layout: IDashboardChartItem[];
  gridCols?: number;
  isEditing?: boolean;
  showBorders?: boolean;
  onLayoutChange?: (newLayout: IDashboardChartItem[]) => void;
  onRemoveChart?: (chartId: string) => void;
  onRefreshChart?: (chartId: string) => void;
  refreshingCharts?: Set<string>;
  onChartResize?: (chartId: string, newSize: { w: number; h: number }) => void;
}

interface GridItemProps {
  item: IDashboardChartWithData;
  layout: IDashboardChartItem;
  index: number;
  isEditing: boolean;
  showBorders: boolean;
  isRefreshing: boolean;
  onRemove?: () => void;
  onRefresh?: () => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
  onResize?: (chartId: string, newSize: { w: number; h: number }) => void;
}

const DraggableGridItem = React.memo(function DraggableGridItem({
  item,
  layout,
  index,
  isEditing,
  showBorders,
  isRefreshing,
  onRemove,
  onRefresh,
  onMove,
  onResize,
}: GridItemProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [showResizeModal, setShowResizeModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleResize = (newW: number, newH: number) => {
    if (onResize) {
      onResize(layout.chartId, { w: newW, h: newH });
      setShowResizeModal(false);
    }
  };

  const chartTitle = layout.titleOverride || item.chart.name;
  const chartData = item.chart.dataSnapshot?.rows || [];
  const chartConfig = item.chart.config as unknown as ChartConfig;

  // Update last refreshed time when data changes
  useEffect(() => {
    if (item.chart.dataSnapshot?.capturedAt) {
      setLastRefreshed(new Date(item.chart.dataSnapshot.capturedAt));
    }
  }, [item.chart.dataSnapshot?.capturedAt]);

  // Calculate grid span
  const gridColumn = `span ${layout.w}`;
  const gridRow = `span ${layout.h}`;

  // Drag functionality
  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: ITEM_TYPE,
    item: (): DragItem => ({ chartId: layout.chartId, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: isEditing,
  });

  // Drop functionality
  const [{ isOver, canDrop }, drop] = useDrop<
    DragItem,
    unknown,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: ITEM_TYPE,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
    hover: (draggedItem, monitor) => {
      if (!ref.current || !isEditing) return;

      const dragIndex = draggedItem.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) return;

      // Get rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Get horizontal middle
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      // Only perform the move when the mouse has crossed half of the items height/width
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY && hoverClientX < hoverMiddleX) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY && hoverClientX > hoverMiddleX) {
        return;
      }

      // Time to actually perform the action
      onMove?.(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      draggedItem.index = hoverIndex;
    },
  });

  // Combine drag and drop refs
  drag(drop(ref));

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8">
        <div className="dark:bg-surface-primary-dark relative h-full w-full max-w-7xl rounded-2xl bg-surface-primary p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">{chartTitle}</h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Minimize2 className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-60px)]">
            <RechartsRenderer config={chartConfig} data={chartData} height={600} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl transition-all duration-200',
        showBorders
          ? 'dark:border-border-dark dark:bg-surface-primary-dark border border-border-light bg-surface-primary'
          : 'dark:bg-surface-primary-dark bg-surface-primary',
        isEditing && 'ring-2 ring-transparent hover:ring-blue-500/50',
        isDragging && 'opacity-50 ring-2 ring-blue-500',
        isOver && canDrop && 'bg-green-500/5 ring-2 ring-green-500/70',
        isEditing && 'cursor-move',
      )}
      style={{
        gridColumn,
        gridRow,
        minHeight: `${layout.h * 100}px`,
      }}
    >
      {/* Header */}
      <div className="dark:border-border-dark flex items-center justify-between border-b border-border-light px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isEditing && (
            <div className="cursor-grab text-text-tertiary hover:text-text-secondary active:cursor-grabbing">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          <h4 className="truncate text-sm font-medium text-text-primary">{chartTitle}</h4>
        </div>
        <div className="flex items-center gap-1">
          {isRefreshing ? (
            <div className="p-1.5">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            </div>
          ) : (
            <button
              onClick={onRefresh}
              className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(true)}
            className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          {isEditing && (
            <>
              <button
                onClick={() => setShowResizeModal(true)}
                className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                title="Resize"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <button
                onClick={onRemove}
                className="rounded-lg p-1.5 text-red-400 opacity-0 transition-all hover:bg-red-500/10 group-hover:opacity-100"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-3">
        {hasError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm">Failed to load chart</p>
            <button
              onClick={() => {
                setHasError(false);
                onRefresh?.();
              }}
              className="text-sm text-blue-500 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
            <div className="rounded-full bg-surface-secondary p-3">
              <AlertCircle className="h-6 w-6 text-text-tertiary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">No data available</p>
              <p className="mt-1 text-xs text-text-tertiary">This chart has no data to display</p>
            </div>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh data
            </button>
          </div>
        ) : (
          <RechartsRenderer
            config={chartConfig}
            data={chartData}
            height={Math.max(150, layout.h * 100 - 80)}
          />
        )}
      </div>

      {/* Timestamp with refresh indicator */}
      <div className="dark:border-border-dark flex items-center justify-between border-t border-border-light px-4 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
          <span>
            {isRefreshing ? 'Refreshing...' : `Updated ${lastRefreshed.toLocaleTimeString()}`}
          </span>
        </div>
        {item.chart.dataSnapshot?.rowCount !== undefined && (
          <span className="text-xs text-text-tertiary">
            {item.chart.dataSnapshot.rowCount.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* Drag overlay indicator */}
      {isEditing && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-blue-500/10 opacity-0 transition-opacity',
            isDragging && 'opacity-100',
          )}
        >
          <div className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
            Moving...
          </div>
        </div>
      )}

      {/* Resize Modal */}
      {showResizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="dark:bg-surface-primary-dark w-80 rounded-xl bg-surface-primary p-4 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Resize Chart</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleResize(3, 2)}
                className="dark:border-border-dark rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
              >
                Small (3x2)
              </button>
              <button
                onClick={() => handleResize(6, 2)}
                className="dark:border-border-dark rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
              >
                Medium (6x2)
              </button>
              <button
                onClick={() => handleResize(6, 3)}
                className="dark:border-border-dark rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
              >
                Large (6x3)
              </button>
              <button
                onClick={() => handleResize(12, 2)}
                className="dark:border-border-dark rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
              >
                Wide (12x2)
              </button>
              <button
                onClick={() => handleResize(12, 3)}
                className="dark:border-border-dark col-span-2 rounded-lg border border-border-light px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
              >
                Full Width (12x3)
              </button>
            </div>
            <button
              onClick={() => setShowResizeModal(false)}
              className="dark:bg-surface-secondary-dark mt-4 w-full rounded-lg bg-surface-secondary py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function DashboardGridContent({
  charts,
  layout,
  gridCols = 12,
  isEditing = false,
  showBorders = true,
  onLayoutChange,
  onRemoveChart,
  onRefreshChart,
  refreshingCharts = new Set(),
  onChartResize,
}: DashboardGridProps) {
  // Create a map for quick chart lookup
  const chartMap = useMemo(() => {
    return charts.reduce(
      (acc, chart) => {
        acc[chart.chartId] = chart;
        return acc;
      },
      {} as Record<string, IDashboardChartWithData>,
    );
  }, [charts]);

  // Sort layout by y then x for proper rendering order
  const sortedLayout = useMemo(() => {
    return [...layout].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }, [layout]);

  const handleRemoveChart = useCallback(
    (chartId: string) => {
      onRemoveChart?.(chartId);
    },
    [onRemoveChart],
  );

  const handleRefreshChart = useCallback(
    (chartId: string) => {
      onRefreshChart?.(chartId);
    },
    [onRefreshChart],
  );

  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const previousLayoutRef = useRef(sortedLayout);

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!onLayoutChange || isDragging) return;

      // Store previous layout for rollback
      previousLayoutRef.current = sortedLayout;
      setIsDragging(true);
      setDragError(null);

      const newLayout = [...sortedLayout];
      const [movedItem] = newLayout.splice(fromIndex, 1);
      newLayout.splice(toIndex, 0, movedItem);

      // Update x, y positions based on new order
      const updatedLayout = newLayout.map((item, idx) => ({
        ...item,
        x: (idx % Math.floor(gridCols / item.w)) * item.w,
        y: Math.floor(idx / Math.floor(gridCols / item.w)) * item.h,
      }));

      onLayoutChange(updatedLayout);

      // Reset dragging state after a short delay
      setTimeout(() => setIsDragging(false), 100);
    },
    [sortedLayout, onLayoutChange, gridCols, isDragging],
  );

  // Rollback function for error handling
  const handleDragError = useCallback(() => {
    if (onLayoutChange) {
      onLayoutChange(previousLayoutRef.current);
      setDragError('Failed to update layout. Changes have been reverted.');
      setTimeout(() => setDragError(null), 3000);
    }
  }, [onLayoutChange]);

  if (charts.length === 0) {
    return (
      <div className="dark:border-border-dark flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-light">
        <p className="text-text-secondary">No charts in this dashboard yet</p>
        {isEditing && (
          <p className="mt-1 text-sm text-text-tertiary">
            Click "Add Chart" to add charts from your library
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(100px, auto)',
      }}
    >
      {sortedLayout.map((layoutItem, index) => {
        const chartItem = chartMap[layoutItem.chartId];
        if (!chartItem) return null;

        return (
          <DraggableGridItem
            key={layoutItem.chartId}
            item={chartItem}
            layout={layoutItem}
            index={index}
            isEditing={isEditing}
            showBorders={showBorders}
            isRefreshing={refreshingCharts.has(layoutItem.chartId)}
            onRemove={() => handleRemoveChart(layoutItem.chartId)}
            onRefresh={() => handleRefreshChart(layoutItem.chartId)}
            onMove={handleMove}
            onResize={onChartResize}
          />
        );
      })}
    </div>
  );
}

export default function DashboardGrid(props: DashboardGridProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <DashboardGridContent {...props} />
    </DndProvider>
  );
}
