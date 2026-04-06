import React, { useState, useMemo, useCallback } from 'react';
import { RefreshCw, Table2, Search, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Spinner, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useAnalyticsSchema, useRefreshSchema } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import TableCard from './TableCard';
import type { TTableSchema } from 'librechat-data-provider';

interface ConnectionSchemaViewProps {
  connectionId: string;
  searchQuery?: string;
}

export default function ConnectionSchemaView({
  connectionId,
  searchQuery = '',
}: ConnectionSchemaViewProps) {
  const localize = useLocalize();
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  
  const { data: schemaData, isLoading, error, isFetching } = useAnalyticsSchema(connectionId, {
    enabled: !!connectionId,
  });
  
  const refreshSchema = useRefreshSchema();

  const handleRefresh = useCallback(() => {
    refreshSchema.mutate(connectionId);
  }, [refreshSchema, connectionId]);

  // Combine parent and local search
  const effectiveSearchQuery = searchQuery || localSearchQuery;

  // Filter tables based on search
  const filteredTables = useMemo(() => {
    if (!schemaData?.schema?.tables) return [];
    if (!effectiveSearchQuery.trim()) return schemaData.schema.tables;

    const query = effectiveSearchQuery.toLowerCase();
    return schemaData.schema.tables.filter((table) => {
      // Match table name
      if (table.name.toLowerCase().includes(query)) return true;
      // Match column names
      if (table.columns.some((col) => col.name.toLowerCase().includes(query))) return true;
      // Match column comments
      if (table.columns.some((col) => col.comment?.toLowerCase().includes(query))) return true;
      return false;
    });
  }, [schemaData?.schema?.tables, effectiveSearchQuery]);

  // Format cached time
  const cachedTimeAgo = useMemo(() => {
    if (!schemaData?.cachedAt) return null;
    const cachedDate = new Date(schemaData.cachedAt);
    const now = new Date();
    const diffMs = now.getTime() - cachedDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  }, [schemaData?.cachedAt]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner className="h-5 w-5" />
        <span className="ml-2 text-xs text-text-secondary">
          {localize('com_sidepanel_loading_schema')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-xs text-text-secondary">
          {localize('com_sidepanel_schema_error')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshSchema.isLoading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${refreshSchema.isLoading ? 'animate-spin' : ''}`} />
          {localize('com_sidepanel_retry')}
        </Button>
      </div>
    );
  }

  if (!schemaData?.schema?.tables || schemaData.schema.tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Table2 className="h-6 w-6 text-text-tertiary" />
        <p className="text-xs text-text-secondary">
          {localize('com_sidepanel_no_tables')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshSchema.isLoading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${refreshSchema.isLoading ? 'animate-spin' : ''}`} />
          {localize('com_sidepanel_refresh_schema')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Schema Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Table2 className="h-3 w-3" />
          <span>
            {filteredTables.length} / {schemaData.schema.tables.length}{' '}
            {localize('com_sidepanel_tables')}
          </span>
          {cachedTimeAgo && (
            <>
              <span>•</span>
              <Clock className="h-3 w-3" />
              <span>{cachedTimeAgo}</span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshSchema.isLoading || isFetching}
          className="h-6 px-2"
          title={localize('com_sidepanel_refresh_schema')}
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshSchema.isLoading || isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Local search (only show if no parent search) */}
      {!searchQuery && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder={localize('com_sidepanel_search_tables')}
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="w-full rounded border border-border-light bg-surface-secondary py-1 pl-7 pr-2 text-xs focus:border-border-medium focus:outline-none"
          />
        </div>
      )}

      {/* Tables List */}
      {filteredTables.length === 0 ? (
        <div className="py-4 text-center text-xs text-text-tertiary">
          {localize('com_sidepanel_no_matching_tables')}
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          <div className="flex flex-col gap-1">
            {filteredTables.map((table) => (
              <TableCard
                key={table.name}
                table={table}
                searchQuery={effectiveSearchQuery}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

