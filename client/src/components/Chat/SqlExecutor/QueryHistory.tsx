import React, { useState, useEffect } from 'react';
import { History, Play, Upload, ListFilter, FilterX, Check, X } from 'lucide-react';
import { useQueryHistory } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears } from 'date-fns';
import { cn } from '~/utils';
import type { TAnalyticsQuery } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

// Format time in short format: 17m, 5h, 6d, etc.
function formatShortTime(date: Date): string {
  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);
  const weeks = differenceInWeeks(now, date);
  const months = differenceInMonths(now, date);
  const years = differenceInYears(now, date);

  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
}

interface QueryHistoryProps {
  conversationId: string | null;
  onSelectQuery: (query: TAnalyticsQuery) => void;
  onExecuteQuery: (sql: string, connectionId: string) => void;
  selectedConnectionId: string | null;
  className?: string;
}

export default function QueryHistory({
  conversationId,
  onSelectQuery,
  onExecuteQuery,
  selectedConnectionId,
  className,
}: QueryHistoryProps) {
  const localize = useLocalize();
  const [isFiltered, setIsFiltered] = useState(false);

  // Reset filter when selected connection changes
  useEffect(() => {
    if (!selectedConnectionId) {
      setIsFiltered(false);
    }
  }, [selectedConnectionId]);

  const { data: history, isLoading } = useQueryHistory(conversationId || '', {
    enabled: !!conversationId,
    limit: 50,
  });

  const filteredHistory = React.useMemo(() => {
    if (!history) return [];
    if (!isFiltered || !selectedConnectionId) return history;
    return history.filter((query) => String(query.connectionId) === String(selectedConnectionId));
  }, [history, isFiltered, selectedConnectionId]);

  if (!conversationId) {
    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_history')}</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-[11px] text-text-tertiary">{localize('com_ui_no_conversation')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_history')}</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-[11px] text-text-tertiary">{localize('com_ui_loading')}...</p>
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_history')}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <History className="mb-2 h-6 w-6 text-text-tertiary" />
          <p className="text-[11px] text-text-tertiary">{localize('com_ui_no_query_history')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-surface-primary', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_history')}</span>
        {selectedConnectionId && (
          <button
            onClick={() => setIsFiltered(!isFiltered)}
            className={cn(
              'rounded p-1 transition-colors',
              isFiltered 
                ? 'text-text-primary bg-surface-tertiary' 
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            )}
            title={isFiltered ? localize('com_ui_show_all') : localize('com_ui_filter_current')}
          >
            {isFiltered ? <FilterX className="h-3 w-3" /> : <ListFilter className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <p className="text-[11px] text-text-tertiary">
              {isFiltered ? localize('com_ui_no_queries_for_connection') : localize('com_ui_no_query_history')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredHistory.map((query) => (
              <div
                key={query._id}
                className="group border-b border-border-light/50 px-2 py-1 hover:bg-surface-secondary transition-colors"
              >
                {/* SQL Preview - Full width */}
                <p className="truncate font-mono text-[10px] text-text-primary leading-tight" title={query.executedSql || query.generatedSql}>
                  {query.executedSql || query.generatedSql}
                </p>

                {/* Actions + Time row - inline for space efficiency */}
                <div className="mt-0.5 flex items-center justify-between">
                  {/* Actions - always visible, compact */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => onSelectQuery(query)}
                      className="flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:text-text-primary transition-colors"
                      title={localize('com_ui_load')}
                    >
                      <Upload className="h-3 w-3" />
                    </button>
                    {query.executedSql && (
                      <button
                        onClick={() => onExecuteQuery(query.executedSql!, query.connectionId)}
                        className="flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:text-green-500 transition-colors"
                        title={localize('com_ui_rerun_query')}
                      >
                        <Play className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  
                  {/* Time and Status */}
                  <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                    {formatShortTime(new Date(query.createdAt))}
                    {query.success ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
