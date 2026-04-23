import React, { useState, useMemo, lazy, Suspense, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
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
  Sparkles,
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
  const [chartToDelete, setChartToDelete] = useState<string | null>(null);

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

  const {
    data: chartsData,
    isLoading,
    error,
  } = useGetChartsQuery({
    search: searchTerm || undefined,
    pinnedOnly: pinnedOnly || undefined,
    pageSize: 50,
  });

  const deleteChartMutation = useDeleteChartMutation();
  const duplicateChartMutation = useDuplicateChartMutation();
  const updateChartMutation = useUpdateChartMutation();

  const charts = useMemo(() => {
    return chartsData?.charts || [];
  }, [chartsData]);

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

  if (!isLoading && charts.length === 0 && !searchTerm && !pinnedOnly) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
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
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
              <FileBarChart className="h-10 w-10 text-primary/70" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-text-primary">No charts yet</h3>
            <p className="mb-6 text-sm leading-relaxed text-text-secondary">
              Create your first chart from query results in the chat interface. Click the
              &quot;Chart&quot; button next to export options to get started.
            </p>
            <button
              onClick={() => navigate('/c/new')}
              className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              <BarChart3 className="h-4 w-4 transition-transform group-hover:scale-110" />
              Go to Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
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

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {isLoading ? (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                : 'space-y-3',
            )}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn(
                  viewMode === 'grid' ? 'h-72 rounded-2xl' : 'h-24 rounded-xl',
                )}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 rounded-xl bg-destructive/10 p-4">
              <X className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">Failed to load charts</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              Retry
            </button>
          </div>
        ) : charts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-text-secondary">No charts found</p>
            {(searchTerm || pinnedOnly) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setPinnedOnly(false);
                }}
                className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                  className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-all hover:bg-destructive/80 disabled:opacity-50"
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
    <div className="sticky top-0 z-20 w-full border-b border-border-light/60 bg-surface-primary/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <a
            href="/"
            onClick={chatLinkHandler}
            className="group flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden text-sm font-medium sm:inline">{localize('com_ui_back_to_chat')}</span>
          </a>
          <div className="h-5 w-px shrink-0 bg-border-light/60" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary">Charts Library</h1>
            {totalCharts > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-secondary px-2 text-xs font-semibold text-text-secondary ring-1 ring-border-light/50">
                {totalCharts}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search charts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-52 rounded-xl border border-border-light/60 bg-surface-secondary/50 pl-9 pr-8 text-sm text-text-primary transition-all placeholder:text-text-tertiary focus:border-primary/30 focus:bg-surface-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setPinnedOnly(!pinnedOnly)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all',
              pinnedOnly
                ? 'border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/10'
                : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium hover:bg-surface-hover hover:text-text-primary',
            )}
            title={pinnedOnly ? 'Show all charts' : 'Show pinned charts only'}
          >
            <Pin className={cn('h-4 w-4', pinnedOnly && 'fill-current')} />
            <span className="hidden lg:inline">Pinned</span>
          </button>

          <div className="flex items-center rounded-xl border border-border-light/60 bg-surface-secondary/50 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-all',
                viewMode === 'grid'
                  ? 'bg-surface-primary text-text-primary shadow-sm ring-1 ring-border-light/50'
                  : 'text-text-tertiary hover:text-text-primary',
              )}
              title="Grid view"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-all',
                viewMode === 'list'
                  ? 'bg-surface-primary text-text-primary shadow-sm ring-1 ring-border-light/50'
                  : 'text-text-tertiary hover:text-text-primary',
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-light/60 bg-surface-primary shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md"
      onClick={onEdit}
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-surface-secondary to-surface-tertiary/50 p-3">
        <RechartsRenderer
          config={chart.config as unknown as ChartConfig}
          data={[]}
          height={160}
        />
        {chart.pinned && (
          <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Pin className="h-3.5 w-3.5 fill-primary text-primary" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="line-clamp-1 flex-1 text-sm font-semibold text-text-primary">
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
          <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {chart.description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="inline-flex items-center rounded-lg bg-surface-secondary px-2 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50">
            {chart.rowCount} rows
          </span>
          <span className="inline-flex items-center rounded-lg bg-surface-secondary px-2 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50 capitalize">
            {chart.config.type}
          </span>
          <span className="ml-auto text-[11px] text-text-tertiary">
            {new Date(chart.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

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
      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border-light/60 bg-surface-primary p-4 shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md"
      onClick={onEdit}
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {chart.name}
          </h3>
          <OrgBadge organizationId={chart.organizationId} />
          {chart.pinned && (
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
              <Pin className="h-3 w-3 fill-primary text-primary" />
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
          <span className="font-medium">{chart.rowCount} rows</span>
          <span className="h-1 w-1 rounded-full bg-border-medium" />
          <span className="capitalize">{chart.config.type}</span>
          <span className="h-1 w-1 rounded-full bg-border-medium" />
          <span>{new Date(chart.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

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

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    }
  }, [isOpen]);

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
          className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
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
              className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-border-light/60 bg-surface-primary shadow-xl ring-1 ring-black/5"
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <div className="p-1">
                <button
                  onClick={(e) => handleAction(e, onEdit)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Sparkles className="h-4 w-4 text-text-secondary" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={(e) => handleAction(e, onTogglePin)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Pin className={cn('h-4 w-4 text-text-secondary', isPinned && 'fill-current text-primary')} />
                  <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                </button>
                <div className="my-1 h-px bg-border-light/60" />
                <button
                  onClick={(e) => handleAction(e, onDuplicate)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Copy className="h-4 w-4 text-text-secondary" />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={(e) => handleAction(e, onDelete)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
