import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  Search,
  Clock,
  Rows3,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  Info,
} from 'lucide-react';
import exportFromJSON from 'export-from-json';
import * as XLSX from 'xlsx';
import type { TQueryResults, TQueryErrorDetails } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

export type ResultsState = 'idle' | 'loading' | 'success' | 'error' | 'warning';

interface ResultsViewerProps {
  results: TQueryResults | null;
  executionTimeMs?: number;
  error?: string;
  errorDetails?: TQueryErrorDetails;
  className?: string;
  isLoading?: boolean;
  onCancel?: () => void;
}

const stateConfig: Record<ResultsState, { icon: React.ReactNode; color: string; bg: string }> = {
  idle: {
    icon: <Rows3 className="h-8 w-8 text-text-tertiary opacity-50" />,
    color: 'text-text-secondary',
    bg: '',
  },
  loading: {
    icon: <Loader2 className="h-8 w-8 animate-spin text-blue-500" />,
    color: 'text-blue-500',
    bg: 'bg-blue-500/5',
  },
  success: {
    icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
    color: 'text-green-500',
    bg: 'bg-green-500/5',
  },
  error: {
    icon: <AlertCircle className="h-8 w-8 text-red-500" />,
    color: 'text-red-500',
    bg: 'bg-red-500/5',
  },
  warning: {
    icon: <AlertTriangle className="h-8 w-8 text-amber-500" />,
    color: 'text-amber-500',
    bg: 'bg-amber-500/5',
  },
};

export default function ResultsViewer({
  results,
  executionTimeMs,
  error,
  errorDetails,
  className,
  isLoading,
  onCancel,
}: ResultsViewerProps) {
  const localize = useLocalize();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Date.now() - startTimeRef.current);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
      setElapsedTime(0);
    }
  }, [isLoading]);

  const state: ResultsState = useMemo(() => {
    if (isLoading) return 'loading';
    if (error) {
      if (errorDetails?.isConnectionError) return 'error';
      if (errorDetails?.isPermissionError) return 'error';
      if (errorDetails?.isSyntaxError) return 'warning';
      if (errorDetails?.isTimeoutError) return 'warning';
      return 'error';
    }
    if (results) {
      if (results.truncated || results.rowCount === 0) return 'warning';
      return 'success';
    }
    return 'idle';
  }, [isLoading, error, errorDetails, results]);

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    if (!results?.columns || results.columns.length === 0) {
      return [];
    }

    return results.columns.map((column) => {
      const columnName = typeof column === 'string' ? column : column.name;
      return {
        accessorKey: String(columnName),
        header: columnName,
        cell: (info: any) => {
          const value = info.getValue();
          const stringValue =
            value === null || value === undefined
              ? 'null'
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);

          if (value === null || value === undefined) {
            return <span className="font-mono text-[11px] italic text-text-tertiary">null</span>;
          }
          if (typeof value === 'object') {
            return (
              <div
                className="max-h-16 overflow-y-auto break-words font-mono text-[11px] leading-tight text-text-primary"
                title={stringValue}
              >
                {stringValue}
              </div>
            );
          }
          return (
            <div
              className="max-h-16 overflow-y-auto break-words font-mono text-[11px] leading-tight text-text-primary"
              title={stringValue}
            >
              {stringValue}
            </div>
          );
        },
      };
    });
  }, [results?.columns]);

  const DISPLAY_LIMIT = 500;
  const data = useMemo(() => {
    if (!results?.rows) return [];
    return results.rows.slice(0, DISPLAY_LIMIT);
  }, [results?.rows]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 100,
      },
    },
  });

  const handleExportCSV = () => {
    if (!results) return;

    const MAX_EXPORT_ROWS = 1000000;
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    let exportData = results.rows;
    let truncated = false;

    if (results.rows.length > MAX_EXPORT_ROWS) {
      exportData = results.rows.slice(0, MAX_EXPORT_ROWS);
      truncated = true;
    }

    const estimatedSize = exportData.length * 100;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      const sizeLimitedRows = Math.floor(MAX_FILE_SIZE_BYTES / 100);
      exportData = exportData.slice(0, sizeLimitedRows);
      truncated = true;
    }

    if (truncated) {
      console.warn(
        `Export truncated to ${exportData.length.toLocaleString()} rows due to limit (max: ${MAX_EXPORT_ROWS.toLocaleString()} rows or ${MAX_FILE_SIZE_MB}MB)`,
      );
    }

    exportFromJSON({
      data: exportData,
      fileName: `query-results-${Date.now()}`,
      exportType: exportFromJSON.types.csv,
    });
  };

  const handleExportExcel = () => {
    if (!results) return;

    const MAX_EXPORT_ROWS = 1000000;
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    let exportData = results.rows;
    let truncated = false;

    if (results.rows.length > MAX_EXPORT_ROWS) {
      exportData = results.rows.slice(0, MAX_EXPORT_ROWS);
      truncated = true;
    }

    const estimatedSize = exportData.length * 150;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      const sizeLimitedRows = Math.floor(MAX_FILE_SIZE_BYTES / 150);
      exportData = exportData.slice(0, sizeLimitedRows);
      truncated = true;
    }

    if (truncated) {
      console.warn(
        `Export truncated to ${exportData.length.toLocaleString()} rows due to limit (max: ${MAX_EXPORT_ROWS.toLocaleString()} rows or ${MAX_FILE_SIZE_MB}MB)`,
      );
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    XLSX.writeFile(workbook, `query-results-${Date.now()}.xlsx`);
  };

  const formatElapsed = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const config = stateConfig[state];

  if (state === 'idle') {
    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_results')}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          {config.icon}
          <p className={cn('text-sm font-medium', config.color)}>No results to display</p>
          <p className="text-xs text-text-tertiary">Run a query to see results here</p>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className={cn('relative flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_results')}
          </span>
        </div>

        <div className="bg-surface-primary/90 absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-text-primary">
              Query running for {formatElapsed(elapsedTime)}...
            </p>
            <p className="text-xs text-text-tertiary">Executing against database</p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-red-200 hover:bg-red-100 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
              Cancel Query
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3 opacity-30">
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-6 flex-1 animate-pulse rounded bg-surface-tertiary"
                    style={{ animationDelay: `${(i * 5 + j) * 50}ms` }}
                  ></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error' || state === 'warning') {
    let errorTypeLabel = localize('com_ui_query_error');
    if (errorDetails?.isSyntaxError) {
      errorTypeLabel = localize('com_ui_syntax_error');
    } else if (errorDetails?.isPermissionError) {
      errorTypeLabel = localize('com_ui_permission_error');
    } else if (errorDetails?.isConnectionError) {
      errorTypeLabel = localize('com_ui_connection_error');
    } else if (errorDetails?.isTimeoutError) {
      errorTypeLabel = localize('com_ui_timeout_error');
    }

    const isError = state === 'error';
    const borderColor = isError
      ? 'border-red-200 dark:border-red-800'
      : 'border-amber-200 dark:border-amber-800';
    const bgColor = isError ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20';
    const iconColor = isError ? 'text-red-500' : 'text-amber-500';
    const titleColor = isError
      ? 'text-red-700 dark:text-red-400'
      : 'text-amber-700 dark:text-amber-400';
    const textColor = isError
      ? 'text-red-600 dark:text-red-300'
      : 'text-amber-600 dark:text-amber-300';
    const Icon = isError ? AlertCircle : AlertTriangle;

    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_results')}
          </span>
        </div>
        <div className="flex flex-1 items-start justify-center overflow-auto p-4">
          <div
            className={cn(
              'flex w-full max-w-2xl flex-col gap-2 rounded border px-4 py-3',
              borderColor,
              bgColor,
            )}
          >
            <div className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', iconColor)} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-semibold', titleColor)}>{errorTypeLabel}</p>
                <p className={cn('mt-1 whitespace-pre-wrap break-words text-xs', textColor)}>
                  {error}
                </p>

                {errorDetails && (
                  <div
                    className={cn(
                      'mt-2 border-t pt-2',
                      isError
                        ? 'border-red-200 dark:border-red-800/50'
                        : 'border-amber-200 dark:border-amber-800/50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex flex-wrap gap-x-4 gap-y-1 text-[10px]',
                        isError
                          ? 'text-red-500/80 dark:text-red-400/70'
                          : 'text-amber-500/80 dark:text-amber-400/70',
                      )}
                    >
                      {errorDetails.code && (
                        <span className="font-mono">Code: {errorDetails.code}</span>
                      )}
                      {errorDetails.sqlState && (
                        <span className="font-mono">SQLState: {errorDetails.sqlState}</span>
                      )}
                      {errorDetails.databaseType && (
                        <span className="capitalize">Database: {errorDetails.databaseType}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!results) return null;

  const safeResults = results;

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-surface-primary', className)}>
      <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {localize('com_ui_results')}
          </span>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 text-text-secondary">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <Rows3 className="h-3 w-3" />
              <span className="font-medium text-text-primary">
                {safeResults.rowCount.toLocaleString()}
              </span>
              <span className="text-text-tertiary">rows</span>
            </span>

            {executionTimeMs !== undefined && (
              <span className="flex items-center gap-1 text-text-secondary">
                <Clock className="h-3 w-3" />
                <span className="font-medium text-text-primary">
                  {(executionTimeMs / 1000).toFixed(2)}s
                </span>
              </span>
            )}

            {safeResults.truncated && (
              <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {localize('com_ui_truncated')}
              </span>
            )}

            {safeResults.rowCount > DISPLAY_LIMIT && (
              <span className="flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Info className="h-3 w-3" />
                Showing {DISPLAY_LIMIT.toLocaleString()} of {safeResults.rowCount.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder={localize('com_ui_search_results')}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-6 w-32 rounded border border-border-light bg-surface-primary pl-6 pr-2 text-[11px] text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title={localize('com_ui_export_csv')}
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Export as Excel"
            >
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-surface-secondary">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-border-light px-2 py-1 text-left font-semibold text-text-secondary"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() &&
                            'cursor-pointer select-none hover:text-text-primary',
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-[10px]">
                          {{
                            asc: '↑',
                            desc: '↓',
                          }[header.column.getIsSorted() as string] ?? ''}
                        </span>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-4 text-center text-[11px] text-text-tertiary"
                >
                  {localize('com_ui_no_matching_results')}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-border-light/50 hover:bg-surface-secondary/50 border-b transition-colors',
                    index % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/30',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-border-light bg-surface-secondary px-3 py-1">
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span>
              {localize('com_ui_page')}{' '}
              <span className="font-medium text-text-primary">
                {table.getState().pagination.pageIndex + 1}
              </span>{' '}
              {localize('com_ui_of')} {table.getPageCount()}
            </span>
            <span className="text-text-tertiary">•</span>
            <span>
              {table.getRowModel().rows.length} {localize('com_ui_of')} {data.length}{' '}
              {localize('com_ui_rows')}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
