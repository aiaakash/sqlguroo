import React, { useState, useRef, useEffect } from 'react';
import {
  Github,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Clock,
  ChevronDown,
  X,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useToastContext } from '@librechat/client';
import { OrgBadge } from '~/components/Organization';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
  OGDialogClose,
  OGDialogFooter,
  Spinner,
  Button,
  Label,
  Input,
  Textarea,
  Checkbox,
} from '@librechat/client';
import {
  useAnalyticsGitHubConnections,
  useCreateGitHubConnection,
  useDeleteGitHubConnection,
  useUpdateGitHubConnection,
  useTestGitHubConnection,
  useSyncGitHubConnection,
  useAnalyticsConnections,
} from '~/components/Nav/SettingsTabs/Analytics/hooks';
import type { TGitHubRepoConnection } from 'librechat-data-provider';

function GitHubIcon({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md bg-surface-tertiary p-1.5 ${className}`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    </div>
  );
}

export default function GitHubConnectionsPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<TGitHubRepoConnection | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);
  const [syncingConnection, setSyncingConnection] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    id: string;
    success: boolean;
    queriesFound?: number;
    error?: string;
  } | null>(null);

  const { data: connections, isLoading, refetch } = useAnalyticsGitHubConnections();
  const createConnection = useCreateGitHubConnection();
  const updateConnection = useUpdateGitHubConnection();
  const deleteConnection = useDeleteGitHubConnection();
  const syncConnection = useSyncGitHubConnection();

  const handleEdit = (connection: TGitHubRepoConnection) => {
    setEditingConnection(connection);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingConnection(null);
  };

  const handleDeleteClick = (id: string) => {
    setConnectionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (connectionToDelete) {
      await deleteConnection.mutateAsync(connectionToDelete);
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingConnection(id);
    setSyncResult(null);
    try {
      const result = await syncConnection.mutateAsync(id);
      const queriesCount = result.queries?.length || result.syncedCount || 0;
      setSyncResult({
        id,
        success: result.success,
        queriesFound: queriesCount,
        error: result.error,
      });

      if (result.success) {
        showToast({
          message: `Synced ${queriesCount} SQL queries from repository`,
          status: 'success',
        });
      } else {
        showToast({
          message: `Sync failed: ${result.error || 'Unknown error'}`,
          status: 'error',
        });
      }
    } catch (err: any) {
      setSyncResult({
        id,
        success: false,
        error: err.message || 'Failed to sync',
      });
      showToast({
        message: `Sync failed: ${err.message || 'Unknown error'}`,
        status: 'error',
      });
    } finally {
      setSyncingConnection(null);
      // Clear sync result after 5 seconds
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const formatLastSynced = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            <span className="font-medium">GitHub Repositories</span>
          </div>
          <OGDialog
            open={isFormOpen}
            onOpenChange={(open) => {
              if (!open) handleCloseForm();
            }}
          >
            <OGDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => setIsFormOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Repository
              </Button>
            </OGDialogTrigger>
            <GitHubConnectionForm
              editingConnection={editingConnection}
              onClose={handleCloseForm}
              onSuccess={() => {
                refetch();
                handleCloseForm();
              }}
            />
          </OGDialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner className="h-5 w-5" />
        </div>
      ) : connections && connections.length > 0 ? (
        <div className="flex flex-col gap-2">
          {connections.map((connection) => {
            const isSyncing = syncingConnection === connection._id;
            const isThisSyncResult = syncResult?.id === connection._id;
            const lastSyncedText = formatLastSynced(connection.lastSyncedAt);

            return (
              <div
                key={connection._id}
                className={`group relative flex flex-col gap-2 rounded-lg border p-2 transition-all duration-200 ${
                  isSyncing
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-border-light bg-surface-secondary hover:border-border-medium hover:bg-surface-tertiary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitHubIcon className="h-7 w-7 shrink-0" />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{connection.name}</span>
                      <OrgBadge organizationId={connection.organizationId} />
                    </div>
                    <span className="truncate text-xs text-text-tertiary">
                      {connection.owner}/{connection.repo}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(connection)}
                      className="h-8 w-8"
                      title="Edit connection"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSync(connection._id)}
                      disabled={isSyncing}
                      className={`h-8 w-8 ${isSyncing ? 'animate-pulse text-blue-500' : ''}`}
                      title={isSyncing ? 'Syncing...' : 'Sync queries from repository'}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(connection._id)}
                      className="h-8 w-8 text-text-secondary hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      title="Delete connection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Sync status row */}
                <div className="flex items-center gap-2 text-xs">
                  {isThisSyncResult && syncResult ? (
                    syncResult.success ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        <span>{syncResult.queriesFound || 0} queries synced</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        <span>{syncResult.error || 'Sync failed'}</span>
                      </div>
                    )
                  ) : connection.lastSyncedAt ? (
                    <div
                      className={`flex items-center gap-1 ${
                        connection.lastSyncSuccess ? 'text-text-tertiary' : 'text-orange-500'
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      <span>Last synced: {lastSyncedText}</span>
                      {connection.lastSyncSuccess === false && connection.syncError && (
                        <span className="max-w-[100px] truncate" title={connection.syncError}>
                          - {connection.syncError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="italic text-text-tertiary">
                      Not synced yet - click sync to load queries
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface-secondary/50 flex flex-col items-center justify-center rounded-lg border border-dashed border-border-light py-6 text-center">
          <Github className="mb-1 h-6 w-6 text-text-tertiary" />
          <p className="text-xs text-text-secondary">No GitHub repos connected</p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <OGDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <OGDialogContent className="w-[400px]">
          <OGDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <OGDialogTitle>Delete GitHub Connection</OGDialogTitle>
            </div>
          </OGDialogHeader>
          <OGDialogDescription className="text-sm text-text-secondary">
            Are you sure you want to delete this GitHub connection? This action cannot be undone and
            all synced queries will be removed.
          </OGDialogDescription>
          <OGDialogFooter>
            <OGDialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </OGDialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </OGDialogFooter>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}

function GitHubConnectionForm({
  onClose,
  editingConnection,
  onSuccess,
}: {
  onClose: () => void;
  editingConnection?: TGitHubRepoConnection | null;
  onSuccess?: () => void;
}) {
  const [name, setName] = useState(editingConnection?.name || '');
  const [owner, setOwner] = useState(editingConnection?.owner || '');
  const [repo, setRepo] = useState(editingConnection?.repo || '');
  const [branch, setBranch] = useState(editingConnection?.branch || 'main');
  const [accessToken, setAccessToken] = useState('');
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>(
    editingConnection?.connectionIds || [],
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const createConnection = useCreateGitHubConnection();
  const updateConnection = useUpdateGitHubConnection();
  const testConnection = useTestGitHubConnection();
  const { data: connections } = useAnalyticsConnections();

  const isEditMode = !!editingConnection;

  useEffect(() => {
    if (editingConnection) {
      setName(editingConnection.name || '');
      setOwner(editingConnection.owner || '');
      setRepo(editingConnection.repo || '');
      setBranch(editingConnection.branch || 'main');
      setSelectedConnectionIds(editingConnection.connectionIds || []);
    }
  }, [editingConnection]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection.mutateAsync({ owner, repo, accessToken, branch });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isEditMode) {
        await updateConnection.mutateAsync({
          id: editingConnection._id,
          data: {
            name,
            branch,
            connectionIds: selectedConnectionIds,
          },
        });
      } else {
        await createConnection.mutateAsync({
          name,
          owner,
          repo,
          branch,
          accessToken,
          connectionIds: selectedConnectionIds,
        });
      }
      onSuccess?.();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err.message ||
          `Failed to ${isEditMode ? 'update' : 'create'} connection`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const databaseOptions =
    connections?.map((conn) => ({
      label: conn.name,
      value: conn._id,
    })) || [];

  return (
    <OGDialogContent className="w-[450px]">
      <OGDialogHeader>
        <OGDialogTitle>
          {isEditMode ? 'Edit GitHub Repository' : 'Connect GitHub Repository'}
        </OGDialogTitle>
        <OGDialogDescription>
          Link a GitHub repository to sync SQL queries for RAG-powered analytics.
        </OGDialogDescription>
      </OGDialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-3">
          <div>
            <Label htmlFor="name" className="mb-1.5 text-xs">
              Connection Name
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Company Queries"
              required
            />
          </div>

          {isEditMode ? (
            <div className="rounded-lg border border-border-light bg-surface-tertiary p-3">
              <div className="mb-2 text-xs text-text-secondary">
                Repository:{' '}
                <span className="font-medium text-text-primary">
                  {owner}/{repo}
                </span>
              </div>
              <div className="text-xs text-text-tertiary">
                Owner, repo, and branch cannot be edited after creation
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="owner" className="mb-1.5 text-xs">
                    Owner
                  </Label>
                  <Input
                    id="owner"
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="company-name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="repo" className="mb-1.5 text-xs">
                    Repository
                  </Label>
                  <Input
                    id="repo"
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="analytics-queries"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="branch" className="mb-1.5 text-xs">
                  Branch
                </Label>
                <Input
                  id="branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
              </div>

              <div>
                <Label htmlFor="accessToken" className="mb-1.5 text-xs">
                  GitHub Personal Access Token
                </Label>
                <Input
                  id="accessToken"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  required
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  Token needs repo scope for private repos
                </p>
              </div>
            </>
          )}

          <div>
            <Label className="mb-1.5 text-xs">
              Link to Databases
            </Label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex w-full items-center justify-between rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm hover:bg-surface-hover"
              >
                <span className="truncate text-text-primary">
                  {selectedConnectionIds.length === 0
                    ? 'Select databases (optional)'
                    : `${selectedConnectionIds.length} database${selectedConnectionIds.length > 1 ? 's' : ''} selected`}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-text-secondary transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isDropdownOpen && (
                <div className="absolute z-[9999] mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border-light bg-surface-primary shadow-lg">
                  {databaseOptions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-tertiary">
                      No databases available
                    </div>
                  ) : (
                    databaseOptions.map((option) => (
                      <div
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover"
                        onClick={() => {
                          if (selectedConnectionIds.includes(option.value)) {
                            setSelectedConnectionIds(
                              selectedConnectionIds.filter((id) => id !== option.value),
                            );
                          } else {
                            setSelectedConnectionIds([...selectedConnectionIds, option.value]);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedConnectionIds.includes(option.value)}
                          aria-label={option.label}
                        />
                        <span className="truncate text-text-primary">{option.label}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedConnectionIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selectedConnectionIds.map((id) => {
                  const option = databaseOptions.find((o) => o.value === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-0.5 text-xs text-text-primary"
                    >
                      <span className="max-w-[120px] truncate">{option?.label || id}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedConnectionIds(
                            selectedConnectionIds.filter((cid) => cid !== id),
                          )
                        }
                        className="ml-0.5 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-text-tertiary">
              Link this repo to specific databases for targeted RAG queries
            </p>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-2 text-xs ${testResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}
            >
              {testResult.success
                ? `Connected! Found: ${testResult.metadata?.fullName}`
                : testResult.error}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-100 p-2 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <OGDialogFooter className="flex justify-between gap-2">
          {!isEditMode && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !owner || !repo || !accessToken}
            >
              {testing ? <Spinner className="h-4 w-4" /> : null}
              Test
            </Button>
          )}
          <div className="flex gap-2">
            <OGDialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </OGDialogClose>
            <Button
              type="submit"
              disabled={isSubmitting || !name || (!isEditMode && (!owner || !repo || !accessToken))}
              variant="submit"
            >
              {isSubmitting ? <Spinner className="h-4 w-4" /> : null}
              {isEditMode ? 'Update' : 'Save'}
            </Button>
          </div>
        </OGDialogFooter>
      </form>
    </OGDialogContent>
  );
}
