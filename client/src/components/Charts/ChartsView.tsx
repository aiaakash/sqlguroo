import React, { useState, useMemo, lazy, Suspense, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Plus,
  Search,
  Grid3X3,
  List,
  Pin,
  Trash2,
  Copy,
  MoreVertical,
  Loader2,
  FileBarChart,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  useGetChartsQuery,
  useDeleteChartMutation,
  useDuplicateChartMutation,
  useUpdateChartMutation,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Skeleton,
  DropdownPopup,
} from '@librechat/client';
import RechartsRenderer from './RechartsRenderer';
import type { ChartConfig } from './RechartsRenderer';
import type { ChartsListResponse } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize, useCustomLink, type TranslationKeys } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import { OrgBadge } from '~/components/Organization';

type ChartListItem = ChartsListResponse['charts'][number];

// Lazy load chart editor modal
const ChartEditorModal = lazy(() => import('./ChartEditorModal'));

type ViewMode = 'grid' | 'list';

export default function ChartsView() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Delete confirmation dialog state
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);

  // Get last conversation ID for back navigation
  const getConversationId = (prevPath: string) => {
    if (!prevPath || prevPath.includes('/d/')) {
      return 'new';
    }
    const lastPathnameParts = prevPath.split('/');
    return lastPathnameParts[lastPathnameParts.length - 1];
  };

  const lastConversationId = useMemo(
    () => getConversationId(prevLocationPath || ''),
    [prevLocationPath],
  );
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId);

  // Fetch charts
  const {
    data: chartsData,
    isLoading,
    error,
  } = useGetChartsQuery({
    search: searchTerm || undefined,
    pinnedOnly: pinnedOnly || undefined,
    pageSize: 50,
  });

  // Mutations
  const deleteChartMutation = useDeleteChartMutation();
  const duplicateChartMutation = useDuplicateChartMutation();
  const updateChartMutation = useUpdateChartMutation();

  // Filter charts based on search
  const charts = useMemo(() => {
    return chartsData?.charts || [];
  }, [chartsData]);

  // Handle chart actions
  const handleDelete = (chartId: string) => {
    setChartToDelete(chartId);
  };

  const handleConfirmDelete = async () => {
    if (chartToDelete) {
      await deleteChartMutation.mutateAsync(chartToDelete);
      setChartToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setChartToDelete(null);
  };

  const handleDuplicate = async (chartId: string) => {
    await duplicateChartMutation.mutateAsync({ chartId });
  };

  const handleTogglePin = async (chartId: string, currentPinned: boolean) => {
    await updateChartMutation.mutateAsync({
      chartId,
      data: { pinned: !currentPinned },
    });
  };

  const handleEditChart = (chartId: string) => {
    setSelectedChartId(chartId);
    setIsEditorOpen(true);
  };

  // Render empty state
  if (!isLoading && charts.length === 0 && !searchTerm && !pinnedOnly) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          pinnedOnly={pinnedOnly}
          setPinnedOnly={setPinnedOnly}
          totalCharts={0}
          chatLinkHandler={chatLinkHandler}
          localize={localize}
        />
        <div className="flex flex-1 flex-col items-center justify-center overflow-auto p-8">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <FileBarChart className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">No charts yet</h3>
          <p className="mb-4 text-center text-sm text-text-secondary">
            Create your first chart from query results in the chat interface.
            <br />
            Click the &quot;Chart&quot; button next to export options.
          </p>
          <button
            onClick={() => navigate('/c/new')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <BarChart3 className="h-4 w-4" />
            Go to Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        pinnedOnly={pinnedOnly}
        setPinnedOnly={setPinnedOnly}
        totalCharts={chartsData?.total || 0}
        chatLinkHandler={chatLinkHandler}
        localize={localize}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div
            className={cn(
              viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3',
            )}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === 'grid' ? 'h-64' : 'h-20'} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-red-500">Failed to load charts</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : charts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-text-secondary">No charts found</p>
            {(searchTerm || pinnedOnly) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setPinnedOnly(false);
                }}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {charts.map((chart) => (
              <ChartCard
                key={chart._id}
                chart={chart}
                onEdit={() => handleEditChart(chart._id)}
                onDelete={() => handleDelete(chart._id)}
                onDuplicate={() => handleDuplicate(chart._id)}
                onTogglePin={() => handleTogglePin(chart._id, chart.pinned)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {charts.map((chart) => (
              <ChartListItem
                key={chart._id}
                chart={chart}
                onEdit={() => handleEditChart(chart._id)}
                onDelete={() => handleDelete(chart._id)}
                onDuplicate={() => handleDuplicate(chart._id)}
                onTogglePin={() => handleTogglePin(chart._id, chart.pinned)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chart Editor Modal */}
      {selectedChartId && isEditorOpen && (
        <Suspense fallback={null}>
          <ChartEditorModal
            chartId={selectedChartId}
            open={isEditorOpen}
            onOpenChange={(open) => {
              setIsEditorOpen(open);
              if (!open) setSelectedChartId(null);
            }}
          />
        </Suspense>
      )}

      {/* Delete Confirmation Dialog */}
      {chartToDelete && (
        <OGDialog open={!!chartToDelete} onOpenChange={(open) => !open && handleCancelDelete()}>
          <OGDialogContent className="sm:max-w-md">
            <OGDialogHeader>
              <OGDialogTitle>Delete Chart</OGDialogTitle>
            </OGDialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-text-secondary">
                Are you sure you want to delete this chart? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelDelete}
                  className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteChartMutation.isLoading}
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteChartMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </OGDialogContent>
        </OGDialog>
      )}

      <Outlet />
    </div>
  );
}

// Header component
function Header({
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  pinnedOnly,
  setPinnedOnly,
  totalCharts,
  chatLinkHandler,
  localize,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  pinnedOnly: boolean;
  setPinnedOnly: (pinned: boolean) => void;
  totalCharts: number;
  chatLinkHandler: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  localize: (phraseKey: TranslationKeys) => string;
}) {
  return (
    <div className="bg-surface-primary/80 dark:border-border-dark sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border-light px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-4">
        <a
          href="/"
          onClick={chatLinkHandler}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden text-base sm:inline">{localize('com_ui_back_to_chat')}</span>
        </a>
        <div className="dark:bg-border-dark h-6 w-px shrink-0 bg-border-light" />
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-text-primary">My Charts</h1>
          {totalCharts > 0 && (
            <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              {totalCharts}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search charts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-surface-primary/50 h-9 w-48 rounded-lg border border-border-light pl-8 pr-3 text-sm text-text-primary transition-all placeholder:text-text-tertiary focus:border-blue-500 focus:bg-surface-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Pinned filter */}
        <button
          onClick={() => setPinnedOnly(!pinnedOnly)}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
            pinnedOnly
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
              : 'border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          )}
          title={pinnedOnly ? 'Show all charts' : 'Show pinned charts only'}
        >
          <Pin className="h-4 w-4" />
          <span className="hidden lg:inline">Pinned</span>
        </button>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-border-light bg-surface-tertiary p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-all',
              viewMode === 'grid'
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
            title="Grid view"
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-all',
              viewMode === 'list'
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Chart card component for grid view
function ChartCard({
  chart,
  onEdit,
  onDelete,
  onDuplicate,
  onTogglePin,
}: {
  chart: ChartListItem;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className="group relative cursor-pointer overflow-visible rounded-lg border border-border-light bg-surface-primary transition-shadow hover:shadow-lg"
      onClick={onEdit}
    >
      {/* Chart Preview */}
      <div className="relative h-40 overflow-hidden bg-surface-secondary p-2">
        <RechartsRenderer
          config={chart.config as unknown as ChartConfig}
          data={[]} // Preview with empty data - chart will render with no data label
          height={144}
        />
        {chart.pinned && (
          <div className="absolute right-2 top-2">
            <Pin className="h-4 w-4 text-blue-500" />
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="line-clamp-1 flex-1 font-medium text-text-primary">
              {chart.name}
            </h3>
            <OrgBadge organizationId={chart.organizationId} />
          </div>
          <ChartActions
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onTogglePin={onTogglePin}
            isPinned={chart.pinned}
          />
        </div>
        {chart.description && (
          <p className="mb-2 line-clamp-2 text-xs text-text-secondary">{chart.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span className="whitespace-nowrap">{chart.rowCount} rows</span>
          <span className="whitespace-nowrap">·</span>
          <span className="whitespace-nowrap">{chart.config.type}</span>
          <span className="whitespace-nowrap">·</span>
          <span className="whitespace-nowrap">
            {new Date(chart.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// Chart list item component for list view
function ChartListItem({
  chart,
  onEdit,
  onDelete,
  onDuplicate,
  onTogglePin,
}: {
  chart: ChartListItem;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className="group flex cursor-pointer items-center gap-4 rounded-lg border border-border-light bg-surface-primary p-3 transition-colors hover:bg-surface-hover"
      onClick={onEdit}
    >
      {/* Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
        <BarChart3 className="h-5 w-5 text-blue-500" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-text-primary">{chart.name}</h3>
          <OrgBadge organizationId={chart.organizationId} />
          {chart.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-blue-500" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span className="whitespace-nowrap">{chart.rowCount} rows</span>
          <span className="whitespace-nowrap">·</span>
          <span className="whitespace-nowrap">{chart.config.type}</span>
          <span className="whitespace-nowrap">·</span>
          <span className="whitespace-nowrap">
            {new Date(chart.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      <ChartActions
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onTogglePin={onTogglePin}
        isPinned={chart.pinned}
      />
    </div>
  );
}

// Chart actions dropdown
function ChartActions({
  onEdit,
  onDelete,
  onDuplicate,
  onTogglePin,
  isPinned,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
  isPinned: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setIsOpen(false);
  };

  // Calculate dropdown position
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-hover group-hover:opacity-100"
          aria-label="Chart actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div
              ref={dropdownRef}
              className="fixed z-[100] w-36 rounded-lg border border-border-light bg-surface-primary py-1 shadow-xl"
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <button
                onClick={(e) => handleAction(e, onTogglePin)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Pin className="h-4 w-4 flex-shrink-0" />
                <span>{isPinned ? 'Unpin' : 'Pin'}</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onDuplicate)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Copy className="h-4 w-4 flex-shrink-0" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onDelete)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-surface-hover"
              >
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                <span>Delete</span>
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
