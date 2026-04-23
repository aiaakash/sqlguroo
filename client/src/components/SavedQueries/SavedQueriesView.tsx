import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Outlet } from 'react-router-dom';
import {
  Search,
  Copy,
  Edit2,
  Trash2,
  MessageSquare,
  Grid3X3,
  List,
  MoreVertical,
  ArrowLeft,
  X,
  Database,
  Code,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  useGetSavedQueriesQuery,
  useDeleteSavedQueryMutation,
  useUpdateSavedQueryMutation,
  type TSavedQuery,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Skeleton,
  useToastContext,
} from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useLocalize, useCustomLink, type TranslationKeys } from '~/hooks';
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
  const [queryToDelete, setQueryToDelete] = useState<string | null>(null);

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

  const handleDelete = useCallback((id: string) => {
    setQueryToDelete(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (queryToDelete) {
      try {
        await deleteMutation.mutateAsync(queryToDelete);
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
      setQueryToDelete(null);
    }
  }, [queryToDelete, deleteMutation, showToast, localize]);

  const handleCancelDelete = useCallback(() => {
    setQueryToDelete(null);
  }, []);

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
      const chatUrl = query.conversationId ? `/c/${query.conversationId}` : '/c/new';
      navigate(chatUrl, {
        state: { savedQuery: query },
      });
    },
    [navigate],
  );

  if (!isLoading && queries.length === 0 && !searchQuery) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          totalQueries={0}
          chatLinkHandler={chatLinkHandler}
          localize={localize}
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
              <Database className="h-10 w-10 text-primary/70" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-text-primary">
              {localize('com_saved_queries_empty')}
            </h3>
            <p className="mb-6 text-sm leading-relaxed text-text-secondary">
              {localize('com_saved_queries_empty_subtitle')}
            </p>
            <button
              onClick={() => navigate('/c/new')}
              className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              <MessageSquare className="h-4 w-4 transition-transform group-hover:scale-110" />
              {localize('com_ui_go_to_chat')}
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-primary-alt">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        totalQueries={data?.total || 0}
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
                className={cn(viewMode === 'grid' ? 'h-56 rounded-2xl' : 'h-20 rounded-xl')}
              />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-text-secondary">
              No saved queries found matching &quot;{searchQuery}&quot;
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Clear search
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

        {data && data.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
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
              className="flex items-center gap-1 rounded-xl border border-border-light/60 bg-surface-secondary/50 px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {localize('com_ui_next')}
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        )}
      </div>

      {queryToDelete && (
        <OGDialog open={!!queryToDelete} onOpenChange={(open) => !open && handleCancelDelete()}>
          <OGDialogContent className="sm:max-w-md">
            <OGDialogHeader>
              <OGDialogTitle>Delete Query</OGDialogTitle>
            </OGDialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-text-secondary">
                Are you sure you want to delete this query? This action cannot be undone.
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
                  disabled={deleteMutation.isLoading}
                  className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-all hover:bg-destructive/80 disabled:opacity-50"
                >
                  {deleteMutation.isLoading ? (
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
};

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
            <span className="hidden text-sm font-medium sm:inline">
              {localize('com_ui_back_to_chat')}
            </span>
          </a>
          <div className="h-5 w-px shrink-0 bg-border-light/60" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-text-primary">Saved Queries</h1>
            {totalQueries > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-secondary px-2 text-xs font-semibold text-text-secondary ring-1 ring-border-light/50">
                {totalQueries}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-52 rounded-xl border border-border-light/60 bg-surface-secondary/50 pl-9 pr-8 text-sm text-text-primary transition-all placeholder:text-text-tertiary focus:border-primary/30 focus:bg-surface-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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
  localize: (phraseKey: TranslationKeys) => string;
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
    <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-light/60 bg-surface-primary shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md">
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-surface-secondary to-surface-tertiary/50 p-3">
        <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Code className="h-4 w-4 text-primary" />
        </div>
        <code className="block h-full overflow-hidden whitespace-pre-wrap pl-10 pt-1 text-xs text-text-secondary line-clamp-5">
          {query.sqlContent}
        </code>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="w-full rounded-lg border border-border-light/60 bg-surface-secondary/50 px-3 py-2 text-sm text-text-primary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
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
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {localize('com_ui_save')}
              </button>
              <button
                onClick={onCancelEdit}
                className="rounded-lg border border-border-light/60 px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
              >
                {localize('com_ui_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h3 className="line-clamp-1 flex-1 text-sm font-semibold text-text-primary">
                  {query.name}
                </h3>
                <OrgBadge organizationId={query.organizationId} />
              </div>
              <QueryActions onEdit={onStartEdit} onDelete={onDelete} onCopy={onCopy} />
            </div>

            <div className="mt-auto flex items-center gap-2 pt-2">
              {query.conversationId && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-secondary px-2 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50">
                  <MessageSquare className="h-3 w-3" />
                  {localize('com_saved_queries_from_chat')}
                </span>
              )}
              <span className="ml-auto text-[11px] text-text-tertiary">
                {formatDate(query.createdAt)}
              </span>
            </div>

            <button
              onClick={onUseInChat}
              className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              {localize('com_saved_queries_use_in_chat')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
  localize: (phraseKey: TranslationKeys) => string;
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
      <div className="flex items-center gap-4 rounded-xl border border-border-light/60 bg-surface-primary p-4 shadow-sm">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
          <Code className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
            className="flex-1 rounded-lg border border-border-light/60 bg-surface-secondary/50 px-3 py-2 text-sm text-text-primary transition-all focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              else if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <button
            onClick={onSaveEdit}
            disabled={!editName.trim() || updateMutation.isLoading}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {localize('com_ui_save')}
          </button>
          <button
            onClick={onCancelEdit}
            className="rounded-lg border border-border-light/60 px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-medium hover:text-text-primary"
          >
            {localize('com_ui_cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border-light/60 bg-surface-primary p-4 shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
        <Code className="h-5 w-5 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {query.name}
          </h3>
          <OrgBadge organizationId={query.organizationId} />
          {query.conversationId && (
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
              <MessageSquare className="h-3 w-3 text-primary" />
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
          <span>{formatDate(query.createdAt)}</span>
        </div>
      </div>

      <button
        onClick={onUseInChat}
        className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
      >
        {localize('com_saved_queries_use_in_chat')}
      </button>
      <QueryActions onEdit={onStartEdit} onDelete={onDelete} onCopy={onCopy} />
    </div>
  );
}

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
              className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-border-light/60 bg-surface-primary shadow-xl ring-1 ring-black/5"
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <div className="p-1">
                <button
                  onClick={(e) => handleAction(e, onCopy)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Copy className="h-4 w-4 text-text-secondary" />
                  <span>Copy SQL</span>
                </button>
                <button
                  onClick={(e) => handleAction(e, onEdit)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Sparkles className="h-4 w-4 text-text-secondary" />
                  <span>Rename</span>
                </button>
                <div className="my-1 h-px bg-border-light/60" />
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

export default SavedQueriesView;
