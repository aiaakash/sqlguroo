import React from 'react';
import {
  Server,
  TestTube,
  Trash2,
  Edit2,
  Check,
  X,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Spinner } from '@librechat/client';

export interface ConnectionActionHandlers {
  onTest?: (connectionId: string) => void;
  onEdit?: (connectionId: string) => void;
  onDelete?: (connectionId: string) => void;
  onToggleDetails?: (connectionId: string) => void;
}

export interface ConnectionCardProps {
  connection: {
    _id: string;
    name: string;
    type: string;
    host?: string;
    port?: number;
    database?: string;
    isSystem?: boolean;
    lastTestSuccess?: boolean | null;
    tableCount?: number;
    queryMode?: string;
    queryTimeout?: number;
    maxRows?: number;
    ssl?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  testingId?: string | null;
  showDetails?: boolean;
  showEdit?: boolean;
  showDelete?: boolean;
  actions?: ConnectionActionHandlers;
}

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

export function DbTypeIcon({ type, className = '' }: { type: string; className?: string }) {
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

export function ConnectionStatusBadge({ lastTestSuccess }: { lastTestSuccess?: boolean | null }) {
  if (lastTestSuccess === true) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (lastTestSuccess === false) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <X className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-tertiary px-1.5 py-0 text-[10px] font-medium text-text-secondary">
      ○
    </span>
  );
}

export function ConnectionCard({
  connection,
  testingId,
  showDetails = false,
  showEdit = true,
  showDelete = true,
  actions,
}: ConnectionCardProps) {
  const isTesting = testingId === connection._id;

  return (
    <div className="rounded-xl border border-border-light bg-surface-secondary transition-all duration-200 hover:border-border-medium hover:bg-surface-tertiary hover:shadow-sm">
      <div className="group relative flex items-center gap-3 p-2.5">
        <DbTypeIcon type={connection.type} className="h-9 w-9 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-text-primary">{connection.name}</span>
            <ConnectionStatusBadge lastTestSuccess={connection.lastTestSuccess} />
            {connection.isSystem && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <BookOpen className="mr-1 h-3 w-3" />
                Sample
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span className="shrink-0 font-medium text-text-secondary">
              {connection.type.toUpperCase()}
            </span>
            {!connection.isSystem && connection.host && (
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
            {connection.tableCount !== undefined && (
              <>
                <span className="text-border-medium">|</span>
                <span>{connection.tableCount} tables</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {actions?.onToggleDetails && (
            <button
              onClick={() => actions.onToggleDetails!(connection._id)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title={showDetails ? 'Hide details' : 'Show details'}
            >
              {showDetails ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            onClick={() => actions?.onTest?.(connection._id)}
            disabled={isTesting}
            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            title="Test connection"
          >
            {isTesting ? <Spinner className="h-3.5 w-3.5" /> : <TestTube className="h-3.5 w-3.5" />}
          </button>
          {showEdit && !connection.isSystem && actions?.onEdit && (
            <button
              onClick={() => actions.onEdit!(connection._id)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Edit connection"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          {showDelete && !connection.isSystem && actions?.onDelete && (
            <button
              onClick={() => actions.onDelete!(connection._id)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
              title="Delete connection"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <div className="border-t border-border-light px-3 py-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            {connection.host && !connection.isSystem && (
              <div>
                <span className="font-medium text-text-secondary">Host:</span>{' '}
                <span className="text-text-primary">{connection.host}</span>
              </div>
            )}
            {connection.port && !connection.isSystem && (
              <div>
                <span className="font-medium text-text-secondary">Port:</span>{' '}
                <span className="text-text-primary">{connection.port}</span>
              </div>
            )}
            {connection.database && (
              <div>
                <span className="font-medium text-text-secondary">Database:</span>{' '}
                <span className="text-text-primary">
                  {connection.isSystem ? 'demo data' : connection.database}
                </span>
              </div>
            )}
            {connection.queryMode && (
              <div>
                <span className="font-medium text-text-secondary">Mode:</span>{' '}
                <span className="text-text-primary">{connection.queryMode}</span>
              </div>
            )}
            {connection.queryTimeout && (
              <div>
                <span className="font-medium text-text-secondary">Timeout:</span>{' '}
                <span className="text-text-primary">{connection.queryTimeout}ms</span>
              </div>
            )}
            {connection.maxRows && (
              <div>
                <span className="font-medium text-text-secondary">Max Rows:</span>{' '}
                <span className="text-text-primary">{connection.maxRows}</span>
              </div>
            )}
            {connection.ssl !== undefined && !connection.isSystem && (
              <div>
                <span className="font-medium text-text-secondary">SSL:</span>{' '}
                <span className={connection.ssl ? 'text-green-600' : 'text-text-tertiary'}>
                  {connection.ssl ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            )}
            {connection.createdAt && (
              <div>
                <span className="font-medium text-text-secondary">Created:</span>{' '}
                <span className="text-text-primary">
                  {new Date(connection.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
