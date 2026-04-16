import React, { useState, useCallback, useEffect } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@librechat/client';
import { Play, X, History, ChevronRight, Clock, Rows3 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { useExecuteQuery } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import { Loader2 } from 'lucide-react';
import ConnectionSelector from './ConnectionSelector';
import SqlEditor from './SqlEditor';
import ResultsViewer from './ResultsViewer';
import QueryHistory from './QueryHistory';
import SaveQueryButton from '~/components/SavedQueries/SaveQueryButton';
import type { TQueryResults, TAnalyticsQuery, TQueryErrorDetails } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface SqlExecutorPanelProps {
  onClose?: () => void;
  className?: string;
}

export default function SqlExecutorPanel({ onClose, className }: SqlExecutorPanelProps) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const localize = useLocalize();
  const [sqlEditorContent, setSqlEditorContent] = useRecoilState(store.sqlEditorContent);
  const [sql, setSql] = useState(sqlEditorContent || '');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [results, setResults] = useState<TQueryResults | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [errorDetails, setErrorDetails] = useState<TQueryErrorDetails | undefined>();
  const [showHistory, setShowHistory] = useState(false);

  const executeQuery = useExecuteQuery();

  const handleExecute = useCallback(() => {
    if (!sql.trim() || !selectedConnectionId) {
      setError(localize('com_ui_select_connection_and_sql'));
      return;
    }

    setError(undefined);
    setErrorDetails(undefined);
    setResults(null);

    executeQuery.mutate(
      {
        sql: sql.trim(),
        connectionId: selectedConnectionId,
        conversationId: conversationId,
      },
      {
        onSuccess: (response) => {
          if (response.success && response.results) {
            setResults(response.results);
            setExecutionTimeMs(response.results.executionTimeMs);
            setError(undefined);
            setErrorDetails(undefined);
          } else {
            setError(response.error || localize('com_ui_query_execution_failed'));
            setErrorDetails(response.errorDetails);
            setResults(null);
          }
        },
        onError: (err: any) => {
          // Try to extract detailed error from axios error response
          const errorData = err?.response?.data;
          if (errorData) {
            setError(errorData.error || err?.message || localize('com_ui_failed_to_execute_query'));
            setErrorDetails(errorData.errorDetails);
          } else {
            setError(err?.message || localize('com_ui_failed_to_execute_query'));
          }
          setResults(null);
        },
      },
    );
  }, [sql, selectedConnectionId, conversationId, executeQuery, localize]);

  // Sync local SQL state with global state
  useEffect(() => {
    setSqlEditorContent(sql);
  }, [sql, setSqlEditorContent]);

  // Sync global state changes to local state (for external updates)
  useEffect(() => {
    if (sqlEditorContent !== sql) {
      setSql(sqlEditorContent);
    }
  }, [sqlEditorContent]);

  const handleSelectQuery = useCallback(
    (query: TAnalyticsQuery) => {
      const newSql = query.executedSql || query.generatedSql;
      setSql(newSql);
      setSqlEditorContent(newSql);
      setSelectedConnectionId(query.connectionId);
      setShowHistory(false);
    },
    [setSqlEditorContent],
  );

  const handleExecuteFromHistory = useCallback(
    (querySql: string, connId: string) => {
      setSql(querySql);
      setSqlEditorContent(querySql);
      setSelectedConnectionId(connId);
      setShowHistory(false);
      setTimeout(() => {
        setSql(querySql);
        if (connId) {
          executeQuery.mutate(
            {
              sql: querySql,
              connectionId: connId,
              conversationId: conversationId,
            },
            {
              onSuccess: (response) => {
                if (response.success && response.results) {
                  setResults(response.results);
                  setExecutionTimeMs(response.results.executionTimeMs);
                  setError(undefined);
                } else {
                  setError(response.error || localize('com_ui_query_execution_failed'));
                  setResults(null);
                }
              },
              onError: (err: any) => {
                // Try to extract detailed error from axios error response
                const errorData = err?.response?.data;
                if (errorData) {
                  setError(
                    errorData.error || err?.message || localize('com_ui_failed_to_execute_query'),
                  );
                  setErrorDetails(errorData.errorDetails);
                } else {
                  setError(err?.message || localize('com_ui_failed_to_execute_query'));
                }
                setResults(null);
              },
            },
          );
        }
      }, 100);
    },
    [conversationId, executeQuery, localize],
  );

  return (
    <div className={cn('flex h-full flex-col bg-surface-primary text-text-primary', className)}>
      {/* Header - Compact toolbar */}
      <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium tracking-wide text-text-secondary">
            {localize('com_ui_role_editor')}
          </span>
          <ConnectionSelector
            selectedConnectionId={selectedConnectionId}
            onConnectionChange={setSelectedConnectionId}
            className="min-w-[180px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <SaveQueryButton
            sqlContent={sql}
            connectionId={selectedConnectionId || undefined}
            conversationId={conversationId}
            className="flex items-center rounded px-2 py-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          />

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'flex items-center rounded px-2 py-1 transition-colors',
              showHistory
                ? 'bg-surface-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
            title={localize('com_ui_toggle_history')}
          >
            <History className="h-[18px] w-[18px]" />
          </button>

          <div className="mx-1 h-3 w-px bg-border-light" />

          <button
            onClick={handleExecute}
            disabled={!sql.trim() || !selectedConnectionId || executeQuery.isLoading}
            className={cn(
              'flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition-all',
              executeQuery.isLoading || !sql.trim() || !selectedConnectionId
                ? 'cursor-not-allowed bg-surface-tertiary text-text-tertiary'
                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700',
            )}
          >
            {executeQuery.isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {localize('com_ui_executing')}
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                {localize('com_ui_run')}
              </>
            )}
          </button>

          {onClose && (
            <>
              <div className="mx-1 h-3 w-px bg-border-light" />
              <button
                onClick={onClose}
                className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                title={localize('com_ui_close')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="vertical">
          {/* SQL Editor Section */}
          <ResizablePanel defaultSize={55} minSize={25} maxSize={75}>
            <div className="flex h-full flex-col">
              <ResizablePanelGroup
                direction="horizontal"
                key={showHistory ? 'with-history' : 'no-history'}
              >
                {/* SQL Editor */}
                <ResizablePanel defaultSize={showHistory ? 75 : 100} minSize={50}>
                  <SqlEditor
                    value={sql}
                    onChange={setSql}
                    onExecute={handleExecute}
                    connectionId={selectedConnectionId}
                  />
                </ResizablePanel>

                {/* Query History Sidebar */}
                {showHistory && (
                  <>
                    <ResizableHandle withHandle className="bg-border-light" />
                    <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                      <QueryHistory
                        conversationId={conversationId || null}
                        onSelectQuery={handleSelectQuery}
                        onExecuteQuery={handleExecuteFromHistory}
                        selectedConnectionId={selectedConnectionId}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>

          {/* Results Section */}
          <ResizableHandle withHandle className="bg-border-light" />
          <ResizablePanel defaultSize={45} minSize={20}>
            <ResultsViewer
              results={results}
              executionTimeMs={executionTimeMs}
              error={error || (executeQuery.error as any)?.message}
              errorDetails={errorDetails}
              isLoading={executeQuery.isPending}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
