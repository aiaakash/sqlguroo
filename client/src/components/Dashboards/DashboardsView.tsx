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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useGetDashboardsQuery,
  useGetSharedDashboardsQuery,
  useDeleteDashboardMutation,
  useDuplicateDashboardMutation,
  useToggleDashboardStarMutation,
  useUpdateDashboardMutation,
} from 'librechat-data-provider';
import { Skeleton, useToastContext, Button, Input, Separator } from '@librechat/client';
import DashboardCard from './DashboardCard';
import CreateDashboardModal from './CreateDashboardModal';
import { cn } from '~/utils';
import { useLocalize, useCustomLink } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import type { FilterTab, ViewMode } from './types';
import type { TranslationKeys } from '~/hooks';
import type { TOptions } from 'i18next';

export default function DashboardsView() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();
  const { showToast } = useToastContext();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('my');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

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

  const deleteMutation = useDeleteDashboardMutation();
  const duplicateMutation = useDuplicateDashboardMutation();
  const starMutation = useToggleDashboardStarMutation();
  const updateMutation = useUpdateDashboardMutation();

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

  const tabs = [
    { id: 'my' as FilterTab, label: 'My Dashboards', icon: LayoutDashboard },
    { id: 'starred' as FilterTab, label: 'Starred', icon: Star },
    { id: 'shared' as FilterTab, label: 'Shared with me', icon: Users },
    { id: 'archived' as FilterTab, label: 'Archived', icon: Archive },
  ];

  const renderEmptyState = () => {
    const emptyStates: Record<FilterTab, { icon: React.ElementType; title: string; description: string }> = {
      my: {
        icon: LayoutDashboard,
        title: 'Create your first dashboard',
        description: 'Combine multiple charts into beautiful, interactive dashboards.',
      },
      starred: {
        icon: Star,
        title: 'No starred dashboards',
        description: 'Star your favorite dashboards to access them quickly.',
      },
      shared: {
        icon: Users,
        title: 'No shared dashboards',
        description: 'Dashboards shared with you will appear here.',
      },
      archived: {
        icon: Archive,
        title: 'No archived dashboards',
        description: 'Archived dashboards will appear here.',
      },
    };

    const state = emptyStates[activeTab];
    const Icon = state.icon;

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
          <Icon className="h-10 w-10 text-primary/70" />
        </div>
        <h3 className="mb-2 text-xl font-semibold text-text-primary">{state.title}</h3>
        <p className="mb-6 max-w-sm text-center text-sm leading-relaxed text-text-secondary">
          {state.description}
        </p>
        {activeTab === 'my' && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
            New Dashboard
          </Button>
        )}
      </div>
    );
  };

  if (
    !isLoading &&
    !currentlyLoading &&
    dashboards.length === 0 &&
    !searchTerm &&
    activeTab === 'my'
  ) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
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
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
            <LayoutDashboard className="h-10 w-10 text-primary/70" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-text-primary">
            Create your first dashboard
          </h3>
          <p className="mb-6 max-w-md text-center text-sm leading-relaxed text-text-secondary">
            Combine multiple charts into beautiful, interactive dashboards.
          </p>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
            New Dashboard
          </Button>
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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
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

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {currentlyLoading ? (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                : 'space-y-3',
            )}
          >
            {Array.from({ length: 8 }).map((_, i) => (
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
            <p className="text-sm font-medium text-destructive">Failed to load dashboards</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="mt-3"
            >
              Retry
            </Button>
          </div>
        ) : dashboards.length === 0 ? (
          searchTerm ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-text-secondary">
                No dashboards found matching &quot;{searchTerm}&quot;
              </p>
              <Button
                onClick={() => setSearchTerm('')}
                variant="outline"
                className="mt-3"
              >
                Clear search
              </Button>
            </div>
          ) : (
            renderEmptyState()
          )
        ) : viewMode === 'grid' ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

      {totalCount > pageSize && (
        <div className="flex items-center justify-between border-t border-border-light/60 bg-surface-primary px-4 py-3 lg:px-6">
          <div className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-text-secondary">
              Page {currentPage} of {Math.ceil(totalCount / pageSize)}
            </span>
            <Button
              onClick={() =>
                setCurrentPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))
              }
              disabled={currentPage >= Math.ceil(totalCount / pageSize)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateDashboardModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleCreateSuccess}
      />

      <Outlet />
    </div>
  );
}

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
  localize: (phraseKey: TranslationKeys, options?: TOptions) => string;
  onCreateClick: () => void;
  tabs: TabConfig[];
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
          <Separator orientation="vertical" className="h-5 bg-border-light/60" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary">Dashboards Library</h1>
            {totalCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-secondary px-2 text-xs font-semibold text-text-secondary ring-1 ring-border-light/50">
                {totalCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="text"
              placeholder="Search dashboards..."
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

          <div className="hidden items-center gap-1.5 md:flex">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FilterTab)}
                variant="outline"
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all',
                  activeTab === tab.id
                    ? 'border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/10'
                    : 'border-border-light/60 bg-surface-secondary/50 text-text-secondary hover:border-border-medium hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                <tab.icon className={cn('h-4 w-4', activeTab === tab.id && 'fill-current')} />
                <span className="hidden lg:inline">{tab.label}</span>
              </Button>
            ))}
          </div>

          <Button
            onClick={onCreateClick}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>

          <div className="flex items-center rounded-xl border border-border-light/60 bg-surface-secondary/50 p-1">
            <Button
              onClick={() => setViewMode('grid')}
              variant="ghost"
              size="icon"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-all',
                viewMode === 'grid'
                  ? 'bg-surface-primary text-text-primary shadow-sm ring-1 ring-border-light/50'
                  : 'text-text-tertiary hover:text-text-primary',
              )}
              title="Grid view"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              onClick={() => setViewMode('list')}
              variant="ghost"
              size="icon"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-all',
                viewMode === 'list'
                  ? 'bg-surface-primary text-text-primary shadow-sm ring-1 ring-border-light/50'
                  : 'text-text-tertiary hover:text-text-primary',
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
