import React, { useState } from 'react';
import {
  Database,
  Plus,
  TestTube,
  Trash2,
  Edit2,
  Server,
  BookOpen,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  OGDialog,
  OGDialogTrigger,
  Spinner,
  Button,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  OGDialogFooter,
} from '@librechat/client';
import ConnectionForm from '~/components/Nav/SettingsTabs/Analytics/ConnectionForm';
import {
  useAnalyticsConnections,
  useDeleteConnection,
  useTestConnection,
} from '~/components/Nav/SettingsTabs/Analytics/hooks';

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
  return (
    DB_ICONS[normalizedType] || {
      icon: '',
      name: type.toUpperCase(),
      color: '#6B7280',
    }
  );
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
            parent.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-secondary"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>';
          }
        }}
      />
    </div>
  );
}

export default function DatabaseConnectionsPanel() {
  const localize = useLocalize();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);
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

  const handleDeleteClick = (connectionId: string) => {
    setConnectionToDelete(connectionId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (connectionToDelete) {
      await deleteConnection.mutateAsync(connectionToDelete);
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
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

  const handleAddNew = () => {
    setEditingConnection(null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex h-auto max-w-full flex-col gap-3 overflow-x-hidden p-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="icon-md" />
            <span className="font-medium">Database Connections</span>
          </div>
          <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <OGDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleAddNew}
              >
                <Plus className="h-4 w-4" />
                Add Connection
              </Button>
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
              <DbTypeIcon type={connection.type} className="h-9 w-9 shrink-0" />

              {/* Connection Info - Compact Layout */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-primary">{connection.name}</span>
                  {/* Status Badge */}
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${
                      connection.lastTestSuccess
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : connection.lastTestSuccess === false
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-surface-tertiary text-text-secondary'
                    }`}
                  >
                    {connection.lastTestSuccess ? (
                      <Check className="h-3 w-3" />
                    ) : connection.lastTestSuccess === false ? (
                      <X className="h-3 w-3" />
                    ) : (
                      '○'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                  {/* <span className="shrink-0 font-medium text-text-secondary">
                    {connection.type.toUpperCase()}
                  </span> */}
                  {/* <span className="text-border-medium">|</span> */}
                  {!connection.isSystem && (
                    <span className="truncate">
                      {connection.host}:{connection.port}
                    </span>
                  )}
                  {!connection.isSystem && <span className="text-border-medium">|</span>}
                  <span className="truncate">
                    {connection.isSystem ? 'Demo data' : connection.database}
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
                      onClick={() => handleDeleteClick(connection._id)}
                      className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
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
        <div className="bg-surface-secondary/50 flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light py-8 text-center">
          <Database className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No database connections configured</p>
          <p className="text-xs text-text-tertiary">
            Add a connection to start asking questions about your data
          </p>
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
              <div>
                <OGDialogTitle>Delete Database Connection</OGDialogTitle>
              </div>
            </div>
          </OGDialogHeader>
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete this database connection? This action cannot be undone.
          </p>
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

      {/* Supported Databases Section - DO NOT MODIFY */}
      <div className="mt-4 border-t border-border-medium pt-4">
        <h4 className="mb-3 font-medium">Supported Databases</h4>
        <div className="flex flex-wrap items-center gap-4 px-1">
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clickhouse.svg"
            alt="ClickHouse"
            title="ClickHouse"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/mysql.svg"
            alt="MySQL"
            title="MySQL"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/postgresql.svg"
            alt="PostgreSQL"
            title="PostgreSQL"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlecloud.svg"
            alt="BigQuery"
            title="BigQuery"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazonaws.svg"
            alt="Redshift"
            title="Redshift"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/snowflake.svg"
            alt="Snowflake"
            title="Snowflake"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/oracle.svg"
            alt="Oracle"
            title="Oracle"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
          <img
            src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftsqlserver.svg"
            alt="SQL Server"
            title="SQL Server"
            className="h-5 w-5 opacity-70 transition-opacity hover:opacity-100 dark:invert"
          />
        </div>
      </div>
    </div>
  );
}
