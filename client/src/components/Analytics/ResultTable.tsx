import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { TQueryColumn } from 'librechat-data-provider';

interface ResultTableProps {
  columns: TQueryColumn[];
  rows: Record<string, unknown>[];
  maxHeight?: string;
}

type SortDirection = 'asc' | 'desc' | null;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0.05,
    },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// Max rows to render in chat for performance
const CHAT_DISPLAY_LIMIT = 50;

export default function ResultTable({ columns, rows, maxHeight = '400px' }: ResultTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Limit rows displayed in chat for performance
  const displayRows = useMemo(() => {
    return rows.slice(0, CHAT_DISPLAY_LIMIT);
  }, [rows]);

  const handleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnName);
      setSortDirection('asc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return displayRows;
    }

    return [...displayRows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [rows, sortColumn, sortDirection]);

  const formatValue = (value: unknown, type: string): string => {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    // Format numbers with locale
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString();
      }
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }

    // Format dates
    if (/date|time|timestamp/i.test(type)) {
      try {
        const date = new Date(String(value));
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      } catch {
        // Fallback to string
      }
    }

    return String(value);
  };

  const getColumnAlign = (type: string): string => {
    if (/int|float|double|decimal|number|bigint/i.test(type)) {
      return 'text-right';
    }
    return 'text-left';
  };

  if (displayRows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center py-10 text-text-secondary"
      >
        <div className="text-center">
          <div className="mb-2 text-4xl">📊</div>
          <p>No results returned</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="min-w-full divide-y divide-border-light">
        <thead className="sticky top-0 z-10 bg-surface-secondary">
          <tr>
            {columns.map((column, index) => (
              <motion.th
                key={column.name}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
                onClick={() => handleSort(column.name)}
                className={`cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-surface-hover ${getColumnAlign(column.type)}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {column.name}
                  </span>
                  <motion.div
                    animate={{
                      rotate: sortColumn === column.name && sortDirection === 'asc' ? 0 : 180,
                      opacity: sortColumn === column.name ? 1 : 0.3,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    {sortColumn === column.name ? (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="h-3.5 w-3.5 text-text-primary" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-text-primary" />
                      )
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-text-tertiary" />
                    )}
                  </motion.div>
                </div>
                <div className="text-[10px] font-normal normal-case text-text-tertiary">
                  {column.type}
                </div>
              </motion.th>
            ))}
          </tr>
        </thead>
        <motion.tbody
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="divide-y divide-border-light bg-surface-primary"
        >
          {sortedRows.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {rowIndex === CHAT_DISPLAY_LIMIT - 1 && rows.length > CHAT_DISPLAY_LIMIT && (
                <tr className="bg-surface-secondary/50">
                  <td
                    colSpan={columns.length}
                    className="px-3 py-2 text-center text-xs text-text-tertiary italic"
                  >
                    ... and {rows.length - CHAT_DISPLAY_LIMIT} more rows (showing first {CHAT_DISPLAY_LIMIT})
                  </td>
                </tr>
              )}
              <motion.tr
                variants={rowVariants}
                whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
                className="transition-colors hover:bg-surface-hover"
              >
                {columns.map((column) => (
                  <td
                    key={column.name}
                    className={`whitespace-nowrap px-3 py-2.5 text-sm ${getColumnAlign(column.type)}`}
                  >
                    <span
                      className={
                        row[column.name] === null || row[column.name] === undefined
                          ? 'italic text-text-tertiary'
                          : 'text-text-primary'
                      }
                    >
                      {formatValue(row[column.name], column.type)}
                    </span>
                  </td>
                ))}
              </motion.tr>
            </React.Fragment>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
