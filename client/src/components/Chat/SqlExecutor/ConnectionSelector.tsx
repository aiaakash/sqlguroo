import React, { useState, useMemo } from 'react';
import { Database, CheckCircle2, XCircle, ChevronDown, Search } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { useAnalyticsConnections } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import type { TDatabaseConnection } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

interface ConnectionSelectorProps {
  selectedConnectionId: string | null;
  onConnectionChange: (connectionId: string) => void;
  className?: string;
}

export default function ConnectionSelector({
  selectedConnectionId,
  onConnectionChange,
  className,
}: ConnectionSelectorProps) {
  const localize = useLocalize();
  const { data: connections, isLoading } = useAnalyticsConnections();
  const [searchQuery, setSearchQuery] = useState('');

  const selectedConnection = connections?.find((conn) => conn._id === selectedConnectionId);

  const filteredConnections = useMemo(() => {
    if (!connections) return [];
    if (!searchQuery.trim()) return connections;
    const query = searchQuery.toLowerCase();
    return connections.filter(
      (conn) =>
        conn.name.toLowerCase().includes(query) ||
        conn.type.toLowerCase().includes(query) ||
        (conn.database || '').toLowerCase().includes(query),
    );
  }, [connections, searchQuery]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px]',
          className,
        )}
      >
        <Database className="h-3 w-3 text-text-tertiary" />
        <span className="text-text-tertiary">{localize('com_ui_loading')}...</span>
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px] text-text-tertiary',
          className,
        )}
      >
        <Database className="h-3 w-3" />
        <span>{localize('com_ui_no_connections')}</span>
      </div>
    );
  }

  return (
    <Select.Root value={selectedConnectionId || undefined} onValueChange={onConnectionChange}>
      <Select.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px]',
          'hover:border-border-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          'transition-colors',
          className,
        )}
      >
        <Database className="h-3 w-3 flex-shrink-0 text-text-secondary" />
        <Select.Value placeholder={localize('com_ui_select_connection')}>
          {selectedConnection ? (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-text-primary">{selectedConnection.name}</span>
              <span className="text-[10px] text-text-tertiary">
                {selectedConnection.type.toUpperCase()}
              </span>
              {selectedConnection.lastTestSuccess === true && (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              )}
              {selectedConnection.lastTestSuccess === false && (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
            </div>
          ) : (
            <span className="text-text-tertiary">{localize('com_ui_select_connection')}</span>
          )}
        </Select.Value>
        <Select.Icon className="ml-1 text-text-tertiary">
          <ChevronDown className="h-3 w-3" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-50 min-w-[260px] rounded border border-border-light bg-surface-primary shadow-lg"
          position="popper"
          sideOffset={4}
        >
          {connections.length > 5 && (
            <div className="border-b border-border-light p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search connections..."
                  className="w-full rounded border border-border-light bg-surface-secondary py-1.5 pl-7 pr-2 text-[11px] text-text-primary placeholder-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          <Select.Viewport className="p-1">
            {filteredConnections.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-text-tertiary">
                No connections match &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredConnections.map((connection) => (
                <Select.Item
                  key={connection._id}
                  value={connection._id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px]',
                    'hover:bg-surface-secondary focus:bg-surface-secondary focus:outline-none',
                    'data-[highlighted]:bg-surface-secondary',
                  )}
                >
                  <Database className="h-3 w-3 flex-shrink-0 text-text-secondary" />
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-text-primary">{connection.name}</span>
                      <span className="text-[10px] text-text-tertiary">
                        {connection.type.toUpperCase()} •{' '}
                        {connection.isSystem ? 'demo data' : connection.database}
                      </span>
                    </div>
                    {connection.lastTestSuccess === true && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                    {connection.lastTestSuccess === false && (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                </Select.Item>
              ))
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
