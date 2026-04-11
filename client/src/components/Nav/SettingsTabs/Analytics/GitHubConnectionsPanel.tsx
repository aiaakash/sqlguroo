import React, { useState } from 'react';
import {
  Github,
  Plus,
  TestTube,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  Spinner,
  Input,
  Button,
} from '@librechat/client';
import {
  useAnalyticsGitHubConnections,
  useCreateGitHubConnection,
  useDeleteGitHubConnection,
  useTestGitHubConnection,
  useSyncGitHubConnection,
} from './hooks';

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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [syncingConnection, setSyncingConnection] = useState<string | null>(null);

  const { data: connections, isLoading, refetch } = useAnalyticsGitHubConnections();
  const createConnection = useCreateGitHubConnection();
  const deleteConnection = useDeleteGitHubConnection();
  const testConnection = useTestGitHubConnection();
  const syncConnection = useSyncGitHubConnection();

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this GitHub connection?')) {
      await deleteConnection.mutateAsync(id);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingConnection(id);
    try {
      await syncConnection.mutateAsync(id);
    } finally {
      setSyncingConnection(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="icon-md" />
            <span className="font-medium">GitHub Repositories</span>
          </div>
          <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <OGDialogTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-lg bg-surface-submit px-3 py-1.5 text-sm text-white hover:bg-surface-submit-hover"
                onClick={() => setIsFormOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Repository
              </button>
            </OGDialogTrigger>
            <GitHubConnectionForm
              onClose={() => {
                setIsFormOpen(false);
                refetch();
              }}
            />
          </OGDialog>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Connect GitHub repositories to use SQL queries from your repos as RAG context
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : connections && connections.length > 0 ? (
        <div className="flex flex-col gap-2">
          {connections.map((connection) => (
            <div
              key={connection._id}
              className="group relative flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary p-2.5 transition-all duration-200 hover:border-border-medium hover:bg-surface-tertiary hover:shadow-sm"
            >
              <GitHubIcon className="h-9 w-9 shrink-0" />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-primary">{connection.name}</span>
                  {connection.lastSyncSuccess !== undefined && (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${
                        connection.lastSyncSuccess
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {connection.lastSyncSuccess ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                  <span className="shrink-0 font-medium text-text-secondary">
                    {connection.owner}/{connection.repo}
                  </span>
                  <span className="text-border-medium">|</span>
                  <span className="shrink-0">branch: {connection.branch}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => handleSync(connection._id)}
                  disabled={syncingConnection === connection._id}
                  className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                  title="Sync queries from repository"
                >
                  {syncingConnection === connection._id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(connection._id)}
                  disabled={deleteConnection.isPending}
                  className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/30"
                  title="Delete connection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface-secondary/50 flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light py-8 text-center">
          <Github className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No GitHub repositories connected</p>
          <p className="text-xs text-text-tertiary">
            Add a repository to use its SQL queries as context for analytics
          </p>
        </div>
      )}
    </div>
  );
}

function GitHubConnectionForm({
  onClose,
  connectionId,
}: {
  onClose: () => void;
  connectionId?: string;
}) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [accessToken, setAccessToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createConnection = useCreateGitHubConnection();
  const testConnection = useTestGitHubConnection();

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
      await createConnection.mutateAsync({
        name,
        owner,
        repo,
        branch,
        accessToken,
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to create connection');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OGDialogContent className="w-[500px] !bg-card">
      <OGDialogHeader>
        <OGDialogTitle>Connect GitHub Repository</OGDialogTitle>
      </OGDialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Company Queries"
              required
              className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Owner</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="company-name"
                required
                className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Repository
              </label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="analytics-queries"
                required
                className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              GitHub Personal Access Token
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              required
              className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Token needs repo scope to access private repositories
            </p>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-3 text-xs ${
                testResult.success
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              }`}
            >
              {testResult.success
                ? `Connected successfully! Found repo: ${testResult.metadata?.fullName}`
                : testResult.error || 'Connection failed'}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-100 p-3 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !owner || !repo || !accessToken}
          >
            {testing ? <Spinner className="h-4 w-4" /> : <TestTube className="h-4 w-4" />}
            Test Connection
          </Button>
          <div className="flex gap-2">
            <OGDialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </OGDialogClose>
            <Button
              type="submit"
              disabled={isSubmitting || !name || !owner || !repo || !accessToken}
            >
              {isSubmitting ? <Spinner className="h-4 w-4" /> : null}
              Save
            </Button>
          </div>
        </div>
      </form>
    </OGDialogContent>
  );
}
