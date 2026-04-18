import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Outlet } from 'react-router-dom';
import {
  Search,
  Copy,
  Edit2,
  Trash2,
  MessageSquare,
  Save,
  Grid3X3,
  List,
  MoreVertical,
  ArrowLeft,
  X,
  Database,
  Code,
} from 'lucide-react';
import {
  useGetSavedQueriesQuery,
  useDeleteSavedQueryMutation,
  useUpdateSavedQueryMutation,
  type TSavedQuery,
} from 'librechat-data-provider';
import { useToastContext, Skeleton } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useLocalize, useCustomLink } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import { cn } from '~/utils';
import { OrgBadge } from '~/components/Organization';

type ViewMode = 'grid' | 'list';

export const SavedQueriesView: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { prevLocationPath } = useDashboardContext();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Get last conversation ID for back navigation
  const getConversationId = (prevPath: string) => {
    if (!prevPath || prevPath.includes('/d/')) {
      return 'new';
    }
    const lastPathnameParts = prevPath.split('/');
    return lastPathnameParts[lastPathnameParts.length - 1];
  };

  const lastConversationId = useMemo(() => getConversationId(prevLocationPath || ''), [prevLocationPath]);
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId);

  const { data, isLoading, refetch } = useGetSavedQueriesQuery({
    page: currentPage,
    limit: 20,
    search: searchQuery || undefined,
    sortBy: 'createdAt',
    sortDirection: 'desc',
  });

  const deleteMutation = useDeleteSavedQueryMutation();
  const updateMutation = useUpdateSavedQueryMutation();

  const queries = useMemo(() => {
    return data?.queries || [];
  }, [data]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleCopy = useCallback(
    async (sqlContent: string) => {
      try {
        await navigator.clipboard.writeText(sqlContent);
        showToast({
          message: localize('com_saved_queries_copied'),
          severity: NotificationSeverity.SUCCESS,
        });
      } catch {
        showToast({
          message: localize('com_saved_queries_copy_error'),
          severity: NotificationSeverity.ERROR,
        });
      }
    },
    [showToast, localize],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(localize('com_saved_queries_delete_confirm'))) {
        return;
      }
      try {
        await deleteMutation.mutateAsync(id);
        showToast({
          message: localize('com_saved_queries_deleted'),
          severity: NotificationSeverity.SUCCESS,
        });
      } catch {
        showToast({
          message: localize('com_saved_queries_delete_error'),
          severity: NotificationSeverity.ERROR,
        });
      }
    },
    [deleteMutation, showToast, localize],
  );

  const startEditing = useCallback((query: TSavedQuery) => {
    setEditingId(query._id);
    setEditName(query.name);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      if (!editName.trim()) {
        return;
      }
      try {
        await updateMutation.mutateAsync({ id, data: { name: editName.trim() } });
        setEditingId(null);
        showToast({
          message: localize('com_saved_queries_updated'),
          severity: NotificationSeverity.SUCCESS,
        });
      } catch {
        showToast({
          message: localize('com_saved_queries_update_error'),
          severity: NotificationSeverity.ERROR,
        });
      }
    },
    [updateMutation, editName, showToast, localize],
  );

  const handleUseInChat = useCallback(
    (query: TSavedQuery) => {
      const chatUrl = query.conversationId
        ? `/c/${query.conversationId}`
        : '/c/new';
      navigate(chatUrl, {
        state: { savedQuery: query },
      });
    },
    [navigate],
  );

  // Render empty state
  if (!isLoading && queries.length === 0 && !searchQuery) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          totalQueries={0}
          chatLinkHandler={chatLinkHandler}
          localize={localize}
        />
        <div className="flex flex-1 flex-col items-center justify-center overflow-auto p-8">
          <div className="mb-4 rounded-full bg-surface-secondary p-4">
            <Database className="h-12 w-12 text-text-tertiary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-text-primary">
            {localize('com_saved_queries_empty')}
          </h3>
          <p className="mb-4 text-center text-sm text-text-secondary">
            {localize('com_saved_queries_empty_subtitle')}
          </p>
          <button
            onClick={() => navigate('/c/new')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4" />
            {localize('com_ui_go_to_chat')}
          </button>
        </div>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        totalQueries={data?.total || 0}
        chatLinkHandler={chatLinkHandler}
        localize={localize}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className={cn(
            viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3',
          )}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === 'grid' ? 'h-48' : 'h-20'} />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-text-secondary">{localize('com_saved_queries_no_results')}</p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                {localize('com_ui_clear_filters')}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {queries.map((query) => (
              <QueryCard
                key={query._id}
                query={query}
                isEditing={editingId === query._id}
                editName={editName}
                setEditName={setEditName}
                onSaveEdit={() => saveEdit(query._id)}
                onCancelEdit={cancelEditing}
                onStartEdit={() => startEditing(query)}
                onCopy={() => handleCopy(query.sqlContent)}
                onDelete={() => handleDelete(query._id)}
                onUseInChat={() => handleUseInChat(query)}
                localize={localize}
                updateMutation={updateMutation}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((query) => (
              <QueryListItem
                key={query._id}
                query={query}
                isEditing={editingId === query._id}
                editName={editName}
                setEditName={setEditName}
                onSaveEdit={() => saveEdit(query._id)}
                onCancelEdit={cancelEditing}
                onStartEdit={() => startEditing(query)}
                onCopy={() => handleCopy(query.sqlContent)}
                onDelete={() => handleDelete(query._id)}
                onUseInChat={() => handleUseInChat(query)}
                localize={localize}
                updateMutation={updateMutation}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 rounded-lg border border-border-light px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              {localize('com_ui_previous')}
            </button>
            <span className="text-sm text-text-secondary">
              {localize('com_saved_queries_page_info', {
                page: currentPage,
                total: data.totalPages,
              })}
            </span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!data.hasMore}
              className="flex items-center gap-1 rounded-lg border border-border-light px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {localize('com_ui_next')}
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        )}
      </div>

      <Outlet />
    </div>
  );
};

// Header component
function Header({
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  totalQueries,
  chatLinkHandler,
  localize,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  totalQueries: number;
  chatLinkHandler: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  localize: (key: string) => string;
}) {
  return (
    <div className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border-light bg-surface-primary/80 px-4 backdrop-blur-md dark:border-border-dark lg:px-6">
      <div className="flex items-center gap-4">
        <a
          href="/"
          onClick={chatLinkHandler}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-base">{localize('com_ui_back_to_chat')}</span>
        </a>
        <div className="h-6 w-px bg-border-light dark:bg-border-dark shrink-0" />
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-text-primary">
            {localize('com_saved_queries_title')}
          </h1>
          {totalQueries > 0 && (
            <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              {totalQueries}
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
            placeholder={localize('com_saved_queries_search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-48 rounded-lg border border-border-light bg-surface-primary/50 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-blue-500 focus:bg-surface-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

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

// Query card component for grid view
function QueryCard({
  query,
  isEditing,
  editName,
  setEditName,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onCopy,
  onDelete,
  onUseInChat,
  localize,
  updateMutation,
}: {
  query: TSavedQuery;
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onUseInChat: () => void;
  localize: (key: string) => string;
  updateMutation: { isLoading: boolean };
}) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border-light bg-surface-primary transition-shadow hover:shadow-lg">
      {/* SQL Preview */}
      <div className="relative h-32 overflow-hidden bg-surface-secondary p-3">
        <div className="absolute left-3 top-3">
          <Code className="h-5 w-5 text-blue-500" />
        </div>
        <code className="block h-full overflow-hidden whitespace-pre-wrap pl-8 pt-1 text-xs text-text-secondary line-clamp-5">
          {query.sqlContent}
        </code>
      </div>

      {/* Card Info */}
      <div className="flex flex-1 flex-col p-3">
        {isEditing ? (
          <div className="mb-3 flex flex-col gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="w-full rounded-md border border-border-medium bg-surface px-2 py-1 text-sm text-text-primary focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                else if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={onSaveEdit}
                disabled={!editName.trim() || updateMutation.isLoading}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {localize('com_ui_save')}
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded border border-border-medium px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover"
              >
                {localize('com_ui_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h3 className="flex-1 font-medium text-text-primary line-clamp-1">{query.name}</h3>
                <OrgBadge organizationId={query.organizationId} />
              </div>
              <QueryActions
                onEdit={onStartEdit}
                onDelete={onDelete}
                onCopy={onCopy}
              />
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
              <span className="whitespace-nowrap">{formatDate(query.createdAt)}</span>
              {query.conversationId && (
                <>
                  <span className="whitespace-nowrap">·</span>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <MessageSquare className="h-3 w-3" />
                    {localize('com_saved_queries_from_chat')}
                  </span>
                </>
              )}
            </div>

            <button
              onClick={onUseInChat}
              className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {localize('com_saved_queries_use_in_chat')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Query list item component for list view
function QueryListItem({
  query,
  isEditing,
  editName,
  setEditName,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onCopy,
  onDelete,
  onUseInChat,
  localize,
  updateMutation,
}: {
  query: TSavedQuery;
  isEditing: boolean;
  editName: string;
  setEditName: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onUseInChat: () => void;
  localize: (key: string) => string;
  updateMutation: { isLoading: boolean };
}) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-light bg-surface-primary p-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
          <Code className="h-5 w-5 text-blue-500" />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
            className="flex-1 rounded-md border border-border-medium bg-surface px-2 py-1 text-sm text-text-primary focus:border-blue-500 focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              else if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <button
            onClick={onSaveEdit}
            disabled={!editName.trim() || updateMutation.isLoading}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {localize('com_ui_save')}
          </button>
          <button
            onClick={onCancelEdit}
            className="rounded border border-border-medium px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover"
          >
            {localize('com_ui_cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-4 rounded-lg border border-border-light bg-surface-primary p-3 transition-colors hover:bg-surface-hover">
      {/* Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
        <Code className="h-5 w-5 text-blue-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-text-primary">{query.name}</h3>
          <OrgBadge organizationId={query.organizationId} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span className="whitespace-nowrap">{formatDate(query.createdAt)}</span>
          {query.conversationId && (
            <>
              <span className="whitespace-nowrap">·</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <MessageSquare className="h-3 w-3" />
                {localize('com_saved_queries_from_chat')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUseInChat}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {localize('com_saved_queries_use_in_chat')}
        </button>
        <QueryActions
          onEdit={onStartEdit}
          onDelete={onDelete}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}

// Query actions dropdown
function QueryActions({
  onEdit,
  onDelete,
  onCopy,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
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
          aria-label="Query actions"
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
                onClick={(e) => handleAction(e, onCopy)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Copy className="h-4 w-4 flex-shrink-0" />
                <span>Copy SQL</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onEdit)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Edit2 className="h-4 w-4 flex-shrink-0" />
                <span>Rename</span>
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

export default SavedQueriesView;
