import React, { useState } from 'react';
import { Database, Plus, TestTube, Trash2, Edit2, Server, BookOpen } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { OGDialog, OGDialogTrigger, Spinner } from '@librechat/client';
import ConnectionForm from './ConnectionForm';
import { useAnalyticsConnections, useDeleteConnection, useTestConnection } from './hooks';

// Database type to icon mapping
const DB_ICONS: Record<string, { icon: string; name: string; color: string }> = {
  clickhouse: {
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/clickhouse/clickhouse-original.svg',
    name: 'ClickHouse',
    color: '#FFCC00',
  },
  mysql: {
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg',
    name: 'MySQL',
    color: '#00758F',
  },
  postgresql: {
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg',
    name: 'PostgreSQL',
    color: '#336791',
  },
  pg: {
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg',
    name: 'PostgreSQL',
    color: '#336791',
  },
  bigquery: {
    icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlebigquery.svg',
    name: 'BigQuery',
    color: '#4285F4',
  },
  redshift: {
    icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazonaws.svg',
    name: 'Redshift',
    color: '#FF9900',
  },
  snowflake: {
    icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/snowflake.svg',
    name: 'Snowflake',
    color: '#29B5E8',
  },
  oracle: {
    icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/oracle/oracle-original.svg',
    name: 'Oracle',
    color: '#F80000',
  },
  mssql: {
    icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftsqlserver.svg',
    name: 'SQL Server',
    color: '#CC2927',
  },
  sqlserver: {
    icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftsqlserver.svg',
    name: 'SQL Server',
    color: '#CC2927',
  },
};

function getDbIcon(type: string) {
  const normalizedType = type.toLowerCase().replace(/\s/g, '');
  return DB_ICONS[normalizedType] || {
    icon: '',
    name: type.toUpperCase(),
    color: '#6B7280',
  };
}

function DbTypeIcon({ type, className = '' }: { type: string; className?: string }) {
  const dbInfo = getDbIcon(type);

  if (!dbInfo.icon) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-surface-tertiary ${className}`}
        title={dbInfo.name}
      >
        <Server className="h-4 w-4 text-text-secondary" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-md bg-surface-tertiary p-1 ${className}`}
      title={dbInfo.name}
    >
      <img
        src={dbInfo.icon}
        alt={dbInfo.name}
        className="h-full w-full object-contain"
        onError={(e) => {
          // Fallback to generic icon if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-secondary"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>';
          }
        }}
      />
    </div>
  );
}

export default function Analytics() {
  const localize = useLocalize();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  // For now, use a default organization ID - in production this would come from auth context
  const organizationId = 'default-org';

  const { data: connections, isLoading, refetch } = useAnalyticsConnections(organizationId);
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  const handleTest = async (connectionId: string) => {
    setTestingConnection(connectionId);
    try {
      await testConnection.mutateAsync(connectionId);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (window.confirm('Are you sure you want to delete this connection?')) {
      await deleteConnection.mutateAsync(connectionId);
    }
  };

  const handleEdit = (connectionId: string) => {
    setEditingConnection(connectionId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingConnection(null);
    refetch();
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="icon-md" />
            <span className="font-medium">Database Connections</span>
          </div>
          <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <OGDialogTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-lg bg-surface-submit px-3 py-1.5 text-sm text-white hover:bg-surface-submit-hover"
                onClick={() => {
                  setEditingConnection(null);
                  setIsFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Connection
              </button>
            </OGDialogTrigger>
            <ConnectionForm
              organizationId={organizationId}
              connectionId={editingConnection}
              onClose={handleCloseForm}
            />
          </OGDialog>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Connect your databases to enable AI-powered analytics queries
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
              {/* Database Type Icon */}
              <DbTypeIcon
                type={connection.type}
                className="h-9 w-9 shrink-0"
              />

              {/* Connection Info - Compact Layout */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-primary">
                    {connection.name}
                  </span>
                  {/* Status Badge */}
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${
                      connection.lastTestSuccess
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : connection.lastTestSuccess === false
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-surface-tertiary text-text-secondary'
                    }`}
                  >
                    {connection.lastTestSuccess
                      ? '●'
                      : connection.lastTestSuccess === false
                        ? '●'
                        : '○'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                  <span className="shrink-0 font-medium text-text-secondary">
                    {connection.type.toUpperCase()}
                  </span>
                  {!connection.isSystem && (
                    <>
                      <span className="text-border-medium">|</span>
                      <span className="truncate">
                        {connection.host}:{connection.port}
                      </span>
                    </>
                  )}
                  <span className="text-border-medium">|</span>
                  <span className="truncate">
                    {connection.isSystem ? 'demo data' : connection.database}
                  </span>
                </div>
              </div>

              {/* Action Buttons - Compact */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                {connection.isSystem ? (
                  // Sample database - show only test button and badge
                  <>
                    <span className="mr-1.5 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      <BookOpen className="mr-1 h-3 w-3" />
                      Sample
                    </span>
                    <button
                      onClick={() => handleTest(connection._id)}
                      disabled={testingConnection === connection._id}
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                      title="Test connection"
                    >
                      {testingConnection === connection._id ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <TestTube className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                ) : (
                  // Regular database - show all action buttons
                  <>
                    <button
                      onClick={() => handleTest(connection._id)}
                      disabled={testingConnection === connection._id}
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                      title="Test connection"
                    >
                      {testingConnection === connection._id ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <TestTube className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(connection._id)}
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                      title="Edit connection"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(connection._id)}
                      disabled={deleteConnection.isPending}
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/30"
                      title="Delete connection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light bg-surface-secondary/50 py-8 text-center">
          <Database className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No database connections configured</p>
          <p className="text-xs text-text-tertiary">
            Add a connection to start asking questions about your data
          </p>
        </div>
      )}

      {/* Supported Databases Section - DO NOT MODIFY */}
      <div className="mt-4 border-t border-border-medium pt-4">
        <h4 className="mb-2 font-medium">Supported Databases</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border-light p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-yellow-100 dark:bg-yellow-900">
              <span className="text-sm font-bold text-yellow-800 dark:text-yellow-200">CH</span>
            </div>
            <div>
              <span className="text-sm font-medium">ClickHouse</span>
              <p className="text-xs text-text-tertiary">Data warehouse</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-light p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-100 dark:bg-blue-900">
              <span className="text-sm font-bold text-blue-800 dark:text-blue-200">My</span>
            </div>
            <div>
              <span className="text-sm font-medium">MySQL</span>
              <p className="text-xs text-text-tertiary">Relational database</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-light p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900">
              <span className="text-sm font-bold text-indigo-800 dark:text-indigo-200">PG</span>
            </div>
            <div>
              <span className="text-sm font-medium">PostgreSQL</span>
              <p className="text-xs text-text-tertiary">Relational database</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-light p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-green-100 dark:bg-green-900">
              <span className="text-sm font-bold text-green-800 dark:text-green-200">BQ</span>
            </div>
            <div>
              <span className="text-sm font-medium">BigQuery</span>
              <p className="text-xs text-text-tertiary">Data warehouse</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-light p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-red-100 dark:bg-red-900">
              <span className="text-sm font-bold text-red-800 dark:text-red-200">RS</span>
            </div>
            <div>
              <span className="text-sm font-medium">Redshift</span>
              <p className="text-xs text-text-tertiary">Data warehouse</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
