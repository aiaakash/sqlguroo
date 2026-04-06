import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import {
  Plus,
  Search,
  Grid3X3,
  List,
  Star,
  Archive,
  Users,
  LayoutDashboard,
  ArrowLeft,
  X,
  Pin,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  useGetDashboardsQuery,
  useGetSharedDashboardsQuery,
  useDeleteDashboardMutation,
  useDuplicateDashboardMutation,
  useToggleDashboardStarMutation,
  useUpdateDashboardMutation,
} from 'librechat-data-provider';
import { Skeleton, useToastContext } from '@librechat/client';
import DashboardCard from './DashboardCard';
import CreateDashboardModal from './CreateDashboardModal';
import { cn } from '~/utils';
import { useLocalize, useCustomLink } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import type { FilterTab, ViewMode } from './types';

export default function DashboardsView() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();
  const { showToast } = useToastContext();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('my');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  // Compute query params based on active tab
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      search: searchTerm || undefined,
      pageSize: pageSize,
      page: currentPage,
    };

    if (activeTab === 'starred') {
      params.starredOnly = true;
    } else if (activeTab === 'archived') {
      params.archivedOnly = true;
    }

    return params;
  }, [searchTerm, activeTab, currentPage, pageSize]);

  // Fetch dashboards
  const {
    data: dashboardsData,
    isLoading,
    error,
  } = useGetDashboardsQuery(queryParams, {
    enabled: activeTab !== 'shared',
  });

  const { data: sharedData, isLoading: isLoadingShared } = useGetSharedDashboardsQuery(
    { pageSize: pageSize, page: currentPage },
    { enabled: activeTab === 'shared' },
  );

  // Mutations
  const deleteMutation = useDeleteDashboardMutation();
  const duplicateMutation = useDuplicateDashboardMutation();
  const starMutation = useToggleDashboardStarMutation();
  const updateMutation = useUpdateDashboardMutation();

  // Get navigation handler
  const getConversationId = (prevPath: string) => {
    if (!prevPath || prevPath.includes('/d/')) return 'new';
    const parts = prevPath.split('/');
    return parts[parts.length - 1];
  };

  const lastConversationId = useMemo(
    () => getConversationId(prevLocationPath || ''),
    [prevLocationPath],
  );
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId);

  // Current dashboards based on tab
  const dashboards = useMemo(() => {
    if (activeTab === 'shared') {
      return sharedData?.dashboards || [];
    }
    return dashboardsData?.dashboards || [];
  }, [activeTab, dashboardsData, sharedData]);

  const totalCount = useMemo(() => {
    if (activeTab === 'shared') {
      return sharedData?.total || 0;
    }
    return dashboardsData?.total || 0;
  }, [activeTab, dashboardsData, sharedData]);

  const currentlyLoading = activeTab === 'shared' ? isLoadingShared : isLoading;

  // Handlers with loading states
  const handleDelete = async (dashboardId: string) => {
    if (confirm('Are you sure you want to delete this dashboard?')) {
      setLoadingActions((prev) => new Set(prev).add(`delete-${dashboardId}`));
      try {
        await deleteMutation.mutateAsync(dashboardId);
        showToast({ message: 'Dashboard deleted successfully', status: 'success' });
      } catch (error) {
        showToast({ message: 'Failed to delete dashboard', status: 'error' });
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(`delete-${dashboardId}`);
          return next;
        });
      }
    }
  };

  const handleDuplicate = async (dashboardId: string) => {
    setLoadingActions((prev) => new Set(prev).add(`duplicate-${dashboardId}`));
    try {
      await duplicateMutation.mutateAsync({ dashboardId });
      showToast({ message: 'Dashboard duplicated successfully', status: 'success' });
    } catch (error) {
      showToast({ message: 'Failed to duplicate dashboard', status: 'error' });
    } finally {
      setLoadingActions((prev) => {
        const next = new Set(prev);
        next.delete(`duplicate-${dashboardId}`);
        return next;
      });
    }
  };

  const handleToggleStar = async (dashboardId: string) => {
    setLoadingActions((prev) => new Set(prev).add(`star-${dashboardId}`));
    try {
      await starMutation.mutateAsync(dashboardId);
    } catch (error) {
      showToast({ message: 'Failed to update star status', status: 'error' });
    } finally {
      setLoadingActions((prev) => {
        const next = new Set(prev);
        next.delete(`star-${dashboardId}`);
        return next;
      });
    }
  };

  const handleArchive = async (dashboardId: string, currentlyArchived: boolean) => {
    setLoadingActions((prev) => new Set(prev).add(`archive-${dashboardId}`));
    try {
      await updateMutation.mutateAsync({
        dashboardId,
        data: { isArchived: !currentlyArchived },
      });
      showToast({
        message: currentlyArchived ? 'Dashboard unarchived' : 'Dashboard archived',
        status: 'success',
      });
    } catch (error) {
      showToast({ message: 'Failed to archive dashboard', status: 'error' });
    } finally {
      setLoadingActions((prev) => {
        const next = new Set(prev);
        next.delete(`archive-${dashboardId}`);
        return next;
      });
    }
  };

  const handleCreateSuccess = (dashboardId: string) => {
    navigate(`/d/dashboards/${dashboardId}/edit`);
  };

  // Tabs configuration for filters
  const tabs = [
    { id: 'my' as FilterTab, label: 'My Dashboards', icon: LayoutDashboard },
    { id: 'starred' as FilterTab, label: 'Starred', icon: Star },
    { id: 'shared' as FilterTab, label: 'Shared with me', icon: Users },
    { id: 'archived' as FilterTab, label: 'Archived', icon: Archive },
  ];

  // Empty state
  const renderEmptyState = () => {
    if (activeTab === 'shared') {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <Users className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">No shared dashboards</h3>
          <p className="text-center text-sm text-text-secondary">
            Dashboards shared with you will appear here.
          </p>
        </div>
      );
    }

    if (activeTab === 'starred') {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <Star className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">No starred dashboards</h3>
          <p className="text-center text-sm text-text-secondary">
            Star your favorite dashboards to access them quickly.
          </p>
        </div>
      );
    }

    if (activeTab === 'archived') {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <Archive className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">No archived dashboards</h3>
          <p className="text-center text-sm text-text-secondary">
            Archived dashboards will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 rounded-full bg-surface-secondary p-4">
          <LayoutDashboard className="h-12 w-12 text-text-tertiary" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-text-primary">Create your first dashboard</h3>
        <p className="mb-4 text-center text-sm text-text-secondary">
          Combine multiple charts into beautiful, interactive dashboards.
        </p>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Dashboard
        </button>
      </div>
    );
  };

  // Show main empty state (no dashboards at all)
  if (
    !isLoading &&
    !currentlyLoading &&
    dashboards.length === 0 &&
    !searchTerm &&
    activeTab === 'my'
  ) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalCount={0}
          chatLinkHandler={chatLinkHandler}
          localize={localize}
          onCreateClick={() => setIsCreateModalOpen(true)}
          tabs={tabs}
        />
        <div className="flex flex-1 flex-col items-center justify-center overflow-auto p-8">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <LayoutDashboard className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">
            Create your first dashboard
          </h3>
          <p className="mb-4 text-center text-sm text-text-secondary">
            Combine multiple charts into beautiful, interactive dashboards.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Dashboard
          </button>
        </div>
        <CreateDashboardModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          onSuccess={handleCreateSuccess}
        />
        <Outlet />
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
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalCount={totalCount}
        chatLinkHandler={chatLinkHandler}
        localize={localize}
        onCreateClick={() => setIsCreateModalOpen(true)}
        tabs={tabs}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {currentlyLoading ? (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'space-y-3',
            )}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === 'grid' ? 'h-64' : 'h-20'} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-red-500">Failed to load dashboards</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : dashboards.length === 0 ? (
          searchTerm ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-text-secondary">
                No dashboards found matching &quot;{searchTerm}&quot;
              </p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            renderEmptyState()
          )
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dashboards.map((dashboard) => (
              <DashboardCard
                key={dashboard._id}
                dashboard={dashboard}
                viewMode="grid"
                onEdit={() => navigate(`/d/dashboards/${dashboard._id}/edit`)}
                onDelete={() => handleDelete(dashboard._id)}
                onDuplicate={() => handleDuplicate(dashboard._id)}
                onToggleStar={() => handleToggleStar(dashboard._id)}
                onArchive={() => handleArchive(dashboard._id, dashboard.isArchived)}
                loadingActions={loadingActions}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {dashboards.map((dashboard) => (
              <DashboardCard
                key={dashboard._id}
                dashboard={dashboard}
                viewMode="list"
                onEdit={() => navigate(`/d/dashboards/${dashboard._id}/edit`)}
                onDelete={() => handleDelete(dashboard._id)}
                onDuplicate={() => handleDuplicate(dashboard._id)}
                onToggleStar={() => handleToggleStar(dashboard._id)}
                onArchive={() => handleArchive(dashboard._id, dashboard.isArchived)}
                loadingActions={loadingActions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalCount > pageSize && (
        <div className="dark:border-border-dark flex items-center justify-between border-t border-border-light px-4 py-3">
          <div className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="dark:border-border-dark flex items-center gap-1 rounded-lg border border-border-light px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-text-secondary">
              Page {currentPage} of {Math.ceil(totalCount / pageSize)}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))
              }
              disabled={currentPage >= Math.ceil(totalCount / pageSize)}
              className="dark:border-border-dark flex items-center gap-1 rounded-lg border border-border-light px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <CreateDashboardModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleCreateSuccess}
      />

      <Outlet />
    </div>
  );
}

// Header component
interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
}

function Header({
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  activeTab,
  setActiveTab,
  totalCount,
  chatLinkHandler,
  localize,
  onCreateClick,
  tabs,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  activeTab: FilterTab;
  setActiveTab: (tab: FilterTab) => void;
  totalCount: number;
  chatLinkHandler: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  localize: (phraseKey: string) => string;
  onCreateClick: () => void;
  tabs: TabConfig[];
}) {
  return (
    <div className="bg-surface-primary/80 dark:border-border-dark sticky top-0 z-20 flex h-16 w-full flex-col border-b border-border-light backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between px-4 lg:px-6">
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
            <h1 className="text-lg font-semibold text-text-primary">My Dashboards</h1>
            {totalCount > 0 && (
              <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {totalCount}
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
              placeholder="Search dashboards..."
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

          {/* Tab filters as dropdown-style buttons */}
          <div className="hidden items-center gap-1 md:flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FilterTab)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                    : 'border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile tab selector - shows active tab only */}
          <div className="md:hidden">
            {tabs.find((t) => t.id === activeTab) && (
              <button className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-500 bg-blue-50 px-3 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                {React.createElement(tabs.find((t) => t.id === activeTab)!.icon, {
                  className: 'h-4 w-4',
                })}
              </button>
            )}
          </div>

          {/* Create button */}
          <button
            onClick={onCreateClick}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
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
    </div>
  );
}
