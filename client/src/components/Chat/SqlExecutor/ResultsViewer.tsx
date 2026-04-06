import React, { useMemo, useState } from 'react';
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
import { Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, Search, Clock, Rows3, FileSpreadsheet } from 'lucide-react';
import exportFromJSON from 'export-from-json';
import * as XLSX from 'xlsx';
import type { TQueryResults, TQueryErrorDetails } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

interface ResultsViewerProps {
  results: TQueryResults | null;
  executionTimeMs?: number;
  error?: string;
  errorDetails?: TQueryErrorDetails;
  className?: string;
}

export default function ResultsViewer({ results, executionTimeMs, error, errorDetails, className }: ResultsViewerProps) {
  const localize = useLocalize();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

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
          const stringValue = value === null || value === undefined 
            ? 'null' 
            : typeof value === 'object' 
              ? JSON.stringify(value) 
              : String(value);
          
          if (value === null || value === undefined) {
            return <span className="text-text-tertiary italic font-mono text-[11px]">null</span>;
          }
          if (typeof value === 'object') {
            return (
              <div 
                className="max-h-16 overflow-y-auto break-words text-text-primary font-mono text-[11px] leading-tight"
                title={stringValue}
              >
                {stringValue}
              </div>
            );
          }
          return (
            <div 
              className="max-h-16 overflow-y-auto break-words text-text-primary font-mono text-[11px] leading-tight"
              title={stringValue}
            >
              {stringValue}
            </div>
          );
        },
      };
    });
  }, [results?.columns]);

  // Limit display to 500 rows in SQL editor for performance
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
    
    // Limit exports to 1M rows or 100MB file size
    const MAX_EXPORT_ROWS = 1000000;
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    let exportData = results.rows;
    let truncated = false;
    
    if (results.rows.length > MAX_EXPORT_ROWS) {
      exportData = results.rows.slice(0, MAX_EXPORT_ROWS);
      truncated = true;
    }
    
    // Check file size estimate (rough estimate: average 100 bytes per row)
    const estimatedSize = exportData.length * 100;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      const sizeLimitedRows = Math.floor(MAX_FILE_SIZE_BYTES / 100);
      exportData = exportData.slice(0, sizeLimitedRows);
      truncated = true;
    }
    
    if (truncated) {
      console.warn(`Export truncated to ${exportData.length.toLocaleString()} rows due to limit (max: ${MAX_EXPORT_ROWS.toLocaleString()} rows or ${MAX_FILE_SIZE_MB}MB)`);
    }
    
    exportFromJSON({
      data: exportData,
      fileName: `query-results-${Date.now()}`,
      exportType: exportFromJSON.types.csv,
    });
  };

  const handleExportExcel = () => {
    if (!results) return;
    
    // Limit exports to 1M rows or 100MB file size
    const MAX_EXPORT_ROWS = 1000000;
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    let exportData = results.rows;
    let truncated = false;
    
    if (results.rows.length > MAX_EXPORT_ROWS) {
      exportData = results.rows.slice(0, MAX_EXPORT_ROWS);
      truncated = true;
    }
    
    // Check file size estimate (rough estimate: average 150 bytes per row for Excel)
    const estimatedSize = exportData.length * 150;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      const sizeLimitedRows = Math.floor(MAX_FILE_SIZE_BYTES / 150);
      exportData = exportData.slice(0, sizeLimitedRows);
      truncated = true;
    }
    
    if (truncated) {
      console.warn(`Export truncated to ${exportData.length.toLocaleString()} rows due to limit (max: ${MAX_EXPORT_ROWS.toLocaleString()} rows or ${MAX_FILE_SIZE_MB}MB)`);
    }
    
    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Create workbook and append worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    // Generate Excel file
    XLSX.writeFile(workbook, `query-results-${Date.now()}.xlsx`);
  };

  // Error state
  if (error) {
    // Determine error type label
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

    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light px-3 py-1.5 bg-surface-secondary">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_results')}</span>
        </div>
        <div className="flex flex-1 items-start justify-center p-4 overflow-auto">
          <div className="w-full max-w-2xl flex flex-col gap-2 rounded border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">{errorTypeLabel}</p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words">{error}</p>
                
                {/* Display error details if available */}
                {errorDetails && (
                  <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800/50">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-red-500/80 dark:text-red-400/70">
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

  // Empty state
  if (!results) {
    return (
      <div className={cn('flex h-full flex-col bg-surface-primary', className)}>
        <div className="flex items-center justify-between border-b border-border-light px-3 py-1.5 bg-surface-secondary">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_results')}</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-text-tertiary">{localize('com_ui_run_query_to_see_results')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-surface-primary', className)}>
      {/* Header - Compact stats and controls */}
      <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{localize('com_ui_results')}</span>
          
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 text-text-secondary">
              <Rows3 className="h-3 w-3" />
              <span className="font-medium text-text-primary">{results.rowCount.toLocaleString()}</span>
              <span className="text-text-tertiary">rows</span>
            </span>
            
            {executionTimeMs !== undefined && (
              <span className="flex items-center gap-1 text-text-secondary">
                <Clock className="h-3 w-3" />
                <span className="font-medium text-text-primary">{(executionTimeMs / 1000).toFixed(2)}s</span>
              </span>
            )}
            
            {results.truncated && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {localize('com_ui_truncated')}
              </span>
            )}
            
            {results.rowCount > DISPLAY_LIMIT && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Showing {DISPLAY_LIMIT.toLocaleString()} of {results.rowCount.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
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
          
          {/* Export buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              title={localize('com_ui_export_csv')}
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1 rounded border border-border-light bg-surface-primary px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              title={localize('com_ui_export_excel')}
            >
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Table - Compact with smaller fonts */}
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
                          header.column.getCanSort() && 'cursor-pointer select-none hover:text-text-primary'
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
                <td colSpan={columns.length} className="px-3 py-4 text-center text-[11px] text-text-tertiary">
                  {localize('com_ui_no_matching_results')}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border-light/50 hover:bg-surface-secondary/50 transition-colors',
                    index % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/30'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td 
                      key={cell.id} 
                      className="px-2 py-1 align-top"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination - Compact */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-border-light bg-surface-secondary px-3 py-1">
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span>
              {localize('com_ui_page')} <span className="font-medium text-text-primary">{table.getState().pagination.pageIndex + 1}</span> {localize('com_ui_of')} {table.getPageCount()}
            </span>
            <span className="text-text-tertiary">•</span>
            <span>
              {table.getRowModel().rows.length} {localize('com_ui_of')} {data.length} {localize('com_ui_rows')}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
