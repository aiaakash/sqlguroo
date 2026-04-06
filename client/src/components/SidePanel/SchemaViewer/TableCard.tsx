import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Table2, Hash } from 'lucide-react';
import ColumnItem from './ColumnItem';
import type { TTableSchema } from 'librechat-data-provider';

interface TableCardProps {
  table: TTableSchema;
  searchQuery?: string;
}

export default function TableCard({ table, searchQuery = '' }: TableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Highlight matching columns if there's a search query
  const matchingColumns = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const query = searchQuery.toLowerCase();
    return new Set(
      table.columns
        .filter(
          (col) =>
            col.name.toLowerCase().includes(query) ||
            col.comment?.toLowerCase().includes(query)
        )
        .map((col) => col.name)
    );
  }, [table.columns, searchQuery]);

  // Auto-expand if search matches columns
  const shouldAutoExpand = matchingColumns.size > 0;
  const effectiveExpanded = isExpanded || shouldAutoExpand;

  return (
    <div className="rounded border border-border-light bg-surface-secondary/50 transition-colors hover:bg-surface-secondary">
      {/* Table Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 p-2 text-left"
      >
        {effectiveExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-tertiary" />
        )}
        <Table2 className="h-3 w-3 flex-shrink-0 text-text-secondary" />
        <span className="flex-1 truncate text-xs font-medium">{table.name}</span>
        <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
          <Hash className="h-2.5 w-2.5" />
          {table.columns.length}
        </span>
        {table.rowCount !== undefined && (
          <span className="text-[10px] text-text-tertiary">
            {formatRowCount(table.rowCount)} rows
          </span>
        )}
      </button>

      {/* Columns List */}
      {effectiveExpanded && (
        <div className="border-t border-border-light bg-surface-primary/50 px-2 py-1">
          <div className="flex flex-col">
            {table.columns.map((column) => (
              <ColumnItem
                key={column.name}
                column={column}
                isHighlighted={matchingColumns.has(column.name)}
              />
            ))}
          </div>

          {/* Sample Data Preview (if available) */}
          {table.sampleData && table.sampleData.length > 0 && (
            <SampleDataPreview sampleData={table.sampleData} columns={table.columns} />
          )}
        </div>
      )}
    </div>
  );
}

function formatRowCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

interface SampleDataPreviewProps {
  sampleData: Record<string, unknown>[];
  columns: TTableSchema['columns'];
}

function SampleDataPreview({ sampleData, columns }: SampleDataPreviewProps) {
  const [showSample, setShowSample] = useState(false);

  if (!sampleData || sampleData.length === 0) return null;

  const displayColumns = columns.slice(0, 5); // Show max 5 columns
  const displayRows = sampleData.slice(0, 3); // Show max 3 rows

  return (
    <div className="mt-2 border-t border-border-light pt-2">
      <button
        onClick={() => setShowSample(!showSample)}
        className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary"
      >
        {showSample ? (
          <ChevronDown className="h-2.5 w-2.5" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" />
        )}
        Sample Data ({sampleData.length} rows)
      </button>

      {showSample && (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-text-tertiary">
                {displayColumns.map((col) => (
                  <th key={col.name} className="px-1 py-0.5 font-medium">
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr key={idx} className="border-t border-border-light">
                  {displayColumns.map((col) => (
                    <td key={col.name} className="max-w-[80px] truncate px-1 py-0.5">
                      {formatCellValue(row[col.name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 30);
  const str = String(value);
  return str.length > 20 ? str.slice(0, 17) + '...' : str;
}

