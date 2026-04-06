import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Table, BarChart3, LineChart, PieChart, Hash } from 'lucide-react';
import type { TQueryResults } from 'librechat-data-provider';
import ResultTable from './ResultTable';
import ChartRenderer from './ChartRenderer';

type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'number';

interface AnalyticsResultProps {
  results: TQueryResults;
  sql: string;
  explanation?: string;
}

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function AnalyticsResult({ results, sql, explanation }: AnalyticsResultProps) {
  const [viewMode, setViewMode] = useState<ChartType>(results.suggestedChartType || 'table');

  const chartOptions: { type: ChartType; icon: React.ReactNode; label: string }[] = useMemo(() => {
    const options: { type: ChartType; icon: React.ReactNode; label: string }[] = [
      { type: 'table', icon: <Table className="h-4 w-4" />, label: 'Table' },
    ];

    // Only show chart options if we have numeric data
    const hasNumericData = results.columns.some((col) =>
      /int|float|double|decimal|number|bigint/i.test(col.type),
    );

    if (hasNumericData && results.rowCount > 0) {
      if (results.rowCount === 1 && results.columns.length === 1) {
        options.push({ type: 'number', icon: <Hash className="h-4 w-4" />, label: 'Number' });
      }
      if (results.rowCount <= 50) {
        options.push({ type: 'bar', icon: <BarChart3 className="h-4 w-4" />, label: 'Bar' });
        options.push({ type: 'line', icon: <LineChart className="h-4 w-4" />, label: 'Line' });
      }
      if (results.rowCount <= 10 && results.columns.length === 2) {
        options.push({ type: 'pie', icon: <PieChart className="h-4 w-4" />, label: 'Pie' });
      }
    }

    return options;
  }, [results]);

  const handleExportCSV = () => {
    const headers = results.columns.map((col) => col.name).join(',');
    const rows = results.rows
      .map((row) =>
        results.columns
          .map((col) => {
            const value = row[col.name];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value);
          })
          .join(','),
      )
      .join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics_results_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(results.rows, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics_results_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="mt-3 overflow-hidden rounded-xl border border-border-medium bg-surface-primary shadow-sm"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-2.5"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-primary">Results</span>
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 500, damping: 30 }}
            className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs font-medium text-text-secondary"
          >
            {results.rowCount.toLocaleString()} row{results.rowCount !== 1 ? 's' : ''}
            {results.truncated && ' (truncated)'}
          </motion.span>
          <span className="text-xs text-text-tertiary">
            • {results.executionTimeMs}ms
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Selector */}
          <div className="flex rounded-lg border border-border-light bg-surface-primary p-0.5">
            {chartOptions.map((option, index) => (
              <motion.button
                key={option.type}
                onClick={() => setViewMode(option.type)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-md ${
                  viewMode === option.type
                    ? 'bg-surface-submit text-white shadow-sm'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
                title={option.label}
              >
                {option.icon}
              </motion.button>
            ))}
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-1 border-l border-border-light pl-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Export as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Export as JSON"
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div variants={itemVariants} className="bg-surface-primary p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {viewMode === 'table' ? (
              <ResultTable columns={results.columns} rows={results.rows} />
            ) : viewMode === 'number' ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex items-center justify-center py-10"
              >
                <div className="text-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                    {String(results.rows[0]?.[results.columns[0]?.name] ?? '-')}
                  </div>
                  <div className="mt-2 text-sm font-medium text-text-secondary">
                    {results.columns[0]?.name ?? ''}
                  </div>
                </div>
              </motion.div>
            ) : (
              <ChartRenderer
                type={viewMode as 'bar' | 'line' | 'pie'}
                columns={results.columns}
                rows={results.rows}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* SQL Preview (collapsible) */}
      <motion.details
        variants={itemVariants}
        className="border-t border-border-light group"
      >
        <summary className="cursor-pointer list-none bg-surface-secondary px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
          <div className="flex items-center justify-between">
            <span>View SQL Query</span>
            <motion.svg
              className="h-4 w-4 transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </div>
        </summary>
        <motion.pre
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-x-auto bg-surface-tertiary p-3 text-xs"
        >
          <code className="font-mono text-text-primary">{sql}</code>
        </motion.pre>
      </motion.details>
    </motion.div>
  );
}
