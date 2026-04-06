import React, { useState, useMemo } from 'react';
import { Database, RefreshCw, Search, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Spinner, Button, Input } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useAnalyticsConnections } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import ConnectionSchemaView from './ConnectionSchemaView';
import type { TDatabaseConnection } from 'librechat-data-provider';

export default function SchemaViewerPanel() {
  const localize = useLocalize();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  
  // Use default organization ID
  const organizationId = 'default-org';
  const { data: connections, isLoading, error } = useAnalyticsConnections(organizationId);

  const filteredConnections = useMemo(() => {
    if (!connections) return [];
    if (!searchQuery.trim()) return connections;
    
    const query = searchQuery.toLowerCase();
    return connections.filter(
      (conn) =>
        conn.name.toLowerCase().includes(query) ||
        conn.database.toLowerCase().includes(query) ||
        conn.type.toLowerCase().includes(query)
    );
  }, [connections, searchQuery]);

  const toggleConnection = (connectionId: string) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(connectionId)) {
        next.delete(connectionId);
      } else {
        next.add(connectionId);
      }
      return next;
    });
  };

  const getDatabaseIcon = (type: string) => {
    const iconMap: Record<string, string> = {
      postgresql: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/postgresql.svg',
      mysql: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/mysql.svg',
      clickhouse: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clickhouse.svg',
      bigquery: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlecloud.svg',
      snowflake: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/snowflake.svg',
      redshift: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazonaws.svg',
      oracle: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/oracle.svg',
      mssql: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftsqlserver.svg',
    };
    return iconMap[type.toLowerCase()];
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center p-4">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-text-secondary">Failed to load connections</p>
      </div>
    );
  }

  return (
    <div className="flex h-auto max-w-full flex-col gap-3 overflow-x-hidden p-3 text-sm text-text-primary">
      {/* Header */}
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center gap-2">
          <Database className="icon-md" />
          <span className="font-medium">{localize('com_sidepanel_schema_viewer')}</span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {localize('com_sidepanel_schema_viewer_description')}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          type="text"
          placeholder={localize('com_sidepanel_search_schema')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-3"
        />
      </div>

      {/* Connections List */}
      {!connections || connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Database className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-text-secondary">{localize('com_sidepanel_no_connections')}</p>
          <p className="text-xs text-text-tertiary">
            {localize('com_sidepanel_add_connection_hint')}
          </p>
        </div>
      ) : filteredConnections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-text-secondary">{localize('com_sidepanel_no_matching_schemas')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredConnections.map((connection) => (
            <ConnectionItem
              key={connection._id}
              connection={connection}
              isExpanded={expandedConnections.has(connection._id)}
              onToggle={() => toggleConnection(connection._id)}
              getDatabaseIcon={getDatabaseIcon}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConnectionItemProps {
  connection: TDatabaseConnection;
  isExpanded: boolean;
  onToggle: () => void;
  getDatabaseIcon: (type: string) => string | undefined;
  searchQuery: string;
}

function ConnectionItem({
  connection,
  isExpanded,
  onToggle,
  getDatabaseIcon,
  searchQuery,
}: ConnectionItemProps) {
  const icon = getDatabaseIcon(connection.type);

  return (
    <div className="rounded-lg border border-border-medium bg-surface-primary">
      {/* Connection Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-surface-hover"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )}
          {icon ? (
            <img
              src={icon}
              alt={connection.type}
              className="h-4 w-4 opacity-70 dark:invert"
            />
          ) : (
            <Database className="h-4 w-4 text-text-secondary" />
          )}
          <div className="flex flex-col">
            <span className="font-medium">{connection.name}</span>
            <span className="text-xs text-text-tertiary">
              {connection.database}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ${
              connection.lastTestSuccess
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : connection.lastTestSuccess === false
                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {connection.lastTestSuccess
              ? '●'
              : connection.lastTestSuccess === false
                ? '○'
                : '◌'}
          </span>
        </div>
      </button>

      {/* Schema View (expanded) */}
      {isExpanded && (
        <div className="border-t border-border-light">
          <ConnectionSchemaView
            connectionId={connection._id}
            searchQuery={searchQuery}
          />
        </div>
      )}
    </div>
  );
}

