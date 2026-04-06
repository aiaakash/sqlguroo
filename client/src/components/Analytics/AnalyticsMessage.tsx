import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Clock, Database, CheckCircle2, Loader2 } from 'lucide-react';
import type { TQueryResults } from 'librechat-data-provider';
import AnalyticsResult from './AnalyticsResult';

interface AnalyticsMessageData {
  generatedSql?: string;
  explanation?: string;
  results?: TQueryResults | null;
  error?: string | null;
  success?: boolean;
  totalTimeMs?: number;
  isLoading?: boolean;
}

interface AnalyticsMessageProps {
  text: string;
  analyticsData?: AnalyticsMessageData;
  isCreatedByUser: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const pulseAnimation = {
  scale: [1, 1.02, 1],
  opacity: [0.7, 1, 0.7],
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

/**
 * Component to render analytics chat messages with SQL queries and results
 */
export default function AnalyticsMessage({
  text,
  analyticsData,
  isCreatedByUser,
}: AnalyticsMessageProps) {
  // If it's a user message or no analytics data, just render the text
  if (isCreatedByUser || !analyticsData) {
    return (
      <div className="markdown prose dark:prose-invert light w-full break-words whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  const { generatedSql, explanation, results, error, success, totalTimeMs, isLoading } = analyticsData;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-4"
    >
      {/* Status indicator */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        {isLoading ? (
          <motion.div
            animate={pulseAnimation}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Executing query...</span>
          </motion.div>
        ) : success ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-2 text-green-600 dark:text-green-400"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Query executed successfully</span>
          </motion.div>
        ) : error ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-2 text-red-600 dark:text-red-400"
          >
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Query failed</span>
          </motion.div>
        ) : (
          <motion.div
            animate={pulseAnimation}
            className="flex items-center gap-2 text-text-secondary"
          >
            <Database className="h-4 w-4" />
            <span className="text-sm font-medium">Query generated</span>
          </motion.div>
        )}
        {totalTimeMs && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-1 text-xs text-text-tertiary"
          >
            <Clock className="h-3 w-3" />
            <span>{totalTimeMs}ms</span>
          </motion.div>
        )}
      </motion.div>

      {/* Explanation */}
      <AnimatePresence>
        {explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            variants={itemVariants}
            className="markdown prose dark:prose-invert light w-full break-words"
          >
            {explanation}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State - Simple rotating circle */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center justify-center rounded-xl border border-border-light bg-surface-secondary p-8"
        >
          <div className="flex items-center gap-3 text-text-secondary">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="h-6 w-6" />
            </motion.div>
            <span className="text-sm font-medium">Loading results...</span>
          </div>
        </motion.div>
      )}

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Query Error</p>
                <p className="mt-1 leading-relaxed">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results with charts and table */}
      <AnimatePresence>
        {results && generatedSql && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnalyticsResult
              results={results}
              sql={generatedSql}
              explanation={explanation}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show SQL if no results (query not executed) */}
      <AnimatePresence>
        {generatedSql && !results && !error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-border-medium overflow-hidden"
          >
            <div className="border-b border-border-light bg-surface-secondary px-4 py-2.5 text-xs font-semibold text-text-secondary">
              Generated SQL Query
            </div>
            <pre className="overflow-x-auto bg-surface-tertiary p-4 text-sm">
              <code className="font-mono text-text-primary">{generatedSql}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
