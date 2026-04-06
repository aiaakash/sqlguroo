import React, { useMemo, useState, lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileSpreadsheet, BarChart3, Code, Table } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import * as XLSX from 'xlsx';
import * as Tabs from '@radix-ui/react-tabs';
import { useGetAnalyticsQueryByMessageIdQuery } from 'librechat-data-provider';
import Markdown from './Markdown';
import { useMessageContext, useMessagesViewContext } from '~/Providers';
import ProgressSteps, { Step } from './ProgressSteps';
import Reasoning from './Parts/Reasoning';
import { cn } from '~/utils';
import store from '~/store';

/**
 * Parse SQL query from message text
 * Looks for SQL in code blocks (```sql ... ``` or just ``` ... ```)
 */
function parseSqlFromText(text: string): string | null {
  if (!text) return null;

  // Try to find SQL in a code block with sql language marker
  const sqlBlockMatch = text.match(/```sql\s*([\s\S]*?)```/i);
  if (sqlBlockMatch && sqlBlockMatch[1]?.trim()) {
    return sqlBlockMatch[1].trim();
  }

  // Try to find SELECT/WITH statements in generic code blocks
  const genericBlockMatch = text.match(/```\s*((?:SELECT|WITH)[\s\S]*?)```/i);
  if (genericBlockMatch && genericBlockMatch[1]?.trim()) {
    return genericBlockMatch[1].trim();
  }

  // Try to find standalone SQL statements (SELECT or WITH) - be more careful with this
  const standaloneMatch = text.match(
    /(?:^|\n)((?:SELECT|WITH)\s+[\s\S]*?(?:;|(?=\n\n|\n\*\*|$)))/im,
  );
  if (standaloneMatch && standaloneMatch[1]?.trim()) {
    return standaloneMatch[1].trim();
  }

  return null;
}

// Lazy load ChartBuilderModal for better performance
const ChartBuilderModal = lazy(() => import('~/components/Charts/ChartBuilderModal'));

interface CloseAIExportButtonsProps {
  text: string;
  message?: {
    endpoint?: string;
    model?: string;
  };
}

interface ParsedContent {
  preResults: string;
  tableContent: string;
  postResults: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * Parse markdown table from response text (looks for "Query Results:" section)
 */
function parseMarkdownTable(text: string): TableData | null {
  if (!text) return null;

  // Look for "**Query Results:**" section
  const resultsSectionMatch = text.match(/\*\*Query Results:\*\*[\s\S]*?(?=\n\n\*|$)/i);
  if (!resultsSectionMatch) return null;

  const resultsSection = resultsSectionMatch[0];

  // Match markdown table lines (lines that contain |)
  const tableLines = resultsSection
    .split('\n')
    .filter((line) => line.includes('|') && line.trim().length > 0);

  if (tableLines.length < 3) return null;

  // Extract headers from first line
  const headers = tableLines[0]
    .split('|')
    .map((h) => h.trim())
    .filter((h) => h.length > 0 && !h.match(/^-+$/)); // Filter out empty and separator patterns

  // Skip separator line (second line with |---|---|)
  // Extract data rows
  const rows: string[][] = [];
  for (let i = 2; i < tableLines.length; i++) {
    const line = tableLines[i];
    // Skip separator lines
    if (line.match(/^\s*\|[\s-|]+\|\s*$/)) continue;

    const values = line
      .split('|')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (values.length === headers.length) {
      rows.push(values);
    }
  }

  if (headers.length === 0 || rows.length === 0) return null;

  return { headers, rows };
}

/**
 * Parse content to separate pre-results, table, and post-results sections
 */
function parseContent(text: string): ParsedContent | null {
  const match = text.match(/([\s\S]*?)(\*\*Query Results:\*\*[\s\S]*)/i);
  if (!match) return null;

  return {
    preResults: match[1], // Don't trim yet, we need to parse steps
    tableContent: match[2],
    postResults: '',
  };
}

/**
 * Remove SQL query section from text (since it's now shown in the SQL tab)
 * Matches patterns like "**Generated SQL Query:**" or "```sql ... ```" blocks
 */
function removeSqlSection(text: string): string {
  if (!text) return '';

  // Remove "**Generated SQL Query:**" or similar headers and the SQL block after it
  // This pattern matches the header and the code block that follows
  const sqlSectionPattern = /\*\*Generated SQL Query:?\*\*\s*```[\s\S]*?```/i;
  text = text.replace(sqlSectionPattern, '');

  // Also remove standalone SQL code blocks (that might not have the header)
  // But be careful not to remove non-SQL code blocks
  const standaloneSqlPattern = /```sql[\s\S]*?```/i;
  text = text.replace(standaloneSqlPattern, '');

  // Clean up extra whitespace left behind
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Parse steps from text
 */
function parseSteps(text: string): { steps: Step[]; remainingText: string } {
  if (!text) return { steps: [], remainingText: '' };

  const lines = text.split('\n');
  const stepsMap = new Map<string, Step>();
  const stepsList: Step[] = [];
  let remainingText = '';

  lines.forEach((line, index) => {
    // Check for running step: ► Step Name
    let match = line.match(/^► (.*)/);
    if (match) {
      const name = match[1].trim();
      if (!stepsMap.has(name)) {
        const step: Step = { name, status: 'running', originalIndex: index };
        stepsMap.set(name, step);
        stepsList.push(step);
      }
      return;
    }

    // Check for completed step: ✓ Step Name
    match = line.match(/^✓ (.*)/);
    if (match) {
      const name = match[1].trim();
      const existing = stepsMap.get(name);
      if (existing) {
        existing.status = 'completed';
      } else {
        const step: Step = { name, status: 'completed', originalIndex: index };
        stepsMap.set(name, step);
        stepsList.push(step);
      }
      return;
    }

    // Check for error step: ✗ Step Name - Error: ...
    match = line.match(/^✗ (.*?) - Error: (.*)/);
    if (match) {
      const name = match[1].trim();
      const error = match[2].trim();
      const existing = stepsMap.get(name);
      if (existing) {
        existing.status = 'error';
        existing.error = error;
      } else {
        const step: Step = { name, status: 'error', error, originalIndex: index };
        stepsMap.set(name, step);
        stepsList.push(step);
      }
      return;
    }

    remainingText += line + '\n';
  });

  return { steps: stepsList, remainingText: remainingText.trim() };
}

/**
 * Parse thinking/reasoning content from <think> tags
 * Returns the thinking content and the text with thinking tags removed
 */
function parseThinkingContent(text: string): { thinkingContent: string; remainingText: string } {
  if (!text) return { thinkingContent: '', remainingText: '' };

  // Match <think>content</think> - handles multiline content
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const thinkingContent = thinkMatch[1].trim();
    // Remove the <think> block from text
    const remainingText = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { thinkingContent, remainingText };
  }

  return { thinkingContent: '', remainingText: text };
}

/**
 * Component to provide CSV, Excel, and Chart buttons for any markdown table in responses
 */
export default function CloseAIExportButtons({ text, message }: CloseAIExportButtonsProps) {
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const {
    messageId,
    conversationId,
    isLatestMessage = false,
    isSubmitting = false,
  } = useMessageContext();

  // Get conversation to access connectionId (stored in model field for analytics)
  const messagesViewContext = useMessagesViewContext();
  const conversation = messagesViewContext?.conversation;

  // SQL Editor Lock feature: sync SQL from chat to editor when lock is enabled
  const sqlEditorLock = useRecoilValue(store.sqlEditorLock);
  const setSqlEditorContent = useSetRecoilState(store.sqlEditorContent);

  // Fetch the analytics query data to get SQL and connectionId for chart creation
  const { data: analyticsQueryRef, isLoading: isLoadingQuery } =
    useGetAnalyticsQueryByMessageIdQuery(messageId, {
      enabled: !!messageId,
    });

  // Parse SQL from message text as fallback
  const parsedSql = useMemo(() => parseSqlFromText(text), [text]);

  // Sync SQL to editor when lock is enabled and SQL is detected in message
  useEffect(() => {
    if (sqlEditorLock && parsedSql) {
      setSqlEditorContent(parsedSql);
    }
  }, [sqlEditorLock, parsedSql, setSqlEditorContent]);

  // Build queryRef for chart creation (includes SQL and connectionId for data refresh)
  // Priority: 1. API response, 2. Parsed from text + conversation model
  const queryRef = useMemo(() => {
    // First try API response
    if (analyticsQueryRef?.sql && analyticsQueryRef?.connectionId) {
      return {
        connectionId: analyticsQueryRef.connectionId,
        sql: analyticsQueryRef.sql,
        messageId: analyticsQueryRef.messageId || messageId,
        conversationId: analyticsQueryRef.conversationId || conversationId || undefined,
      };
    }

    // Fallback: use parsed SQL from text and connectionId from conversation.model
    // For analytics endpoints, conversation.model stores the connectionId
    const connId = conversation?.model;
    if (parsedSql && connId) {
      return {
        connectionId: connId,
        sql: parsedSql,
        messageId,
        conversationId: conversationId || conversation?.conversationId || undefined,
      };
    }

    return undefined;
  }, [analyticsQueryRef, parsedSql, conversation, messageId, conversationId]);

  // Parse table data from text (works for any markdown table)
  const tableData = useMemo(() => {
    if (!text) return null;
    return parseMarkdownTable(text);
  }, [text]);

  // Parse content sections
  const parsedContent = useMemo(() => {
    if (!text || !tableData) return null;
    return parseContent(text);
  }, [text, tableData]);

  // Check if table has enough data for charting (at least 2 rows, 2 columns)
  const canCreateChart = useMemo(() => {
    return tableData && tableData.headers.length >= 2 && tableData.rows.length >= 2;
  }, [tableData]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!tableData) return;

    const { headers, rows } = tableData;

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvHeaders = headers.map(escapeCSV).join(',');
    const csvRows = rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
    const csv = `${csvHeaders}\n${csvRows}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_results_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export to Excel (XLSX format)
  const handleExportExcel = () => {
    if (!tableData) return;

    const { headers, rows } = tableData;

    // Convert to array of objects for xlsx
    const worksheetData = rows.map((row) => {
      const rowObj: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObj[header] = row[index] || '';
      });
      return rowObj;
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // Download file
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_results_${Date.now()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Parse steps from text (fallback handling)
  const fallbackSteps = useMemo(() => {
    if (tableData && parsedContent) return { steps: [], remainingText: '' };
    return parseSteps(text);
  }, [text, tableData, parsedContent]);

  // Parse steps from preResults (normal handling)
  const preResultsSteps = useMemo(() => {
    if (!parsedContent) return { steps: [], remainingText: '' };
    return parseSteps(parsedContent.preResults);
  }, [parsedContent]);

  // Parse thinking content from text (for agent reasoning display)
  const { thinkingContent, remainingText: textWithoutThinking } = useMemo(() => {
    return parseThinkingContent(text);
  }, [text]);

  // Re-parse steps from text without thinking tags
  const stepsWithoutThinking = useMemo(() => {
    if (tableData && parsedContent) return { steps: [], remainingText: '' };
    return parseSteps(textWithoutThinking);
  }, [textWithoutThinking, tableData, parsedContent]);

  // Only render if we have table data and parsed content
  if (!tableData || !parsedContent) {
    // Use fallback steps + thinking content + remaining markdown
    return (
      <div className="relative">
        {thinkingContent && (
          <div className="mb-4">
            <Reasoning reasoning={thinkingContent} isLast={isLatestMessage} />
          </div>
        )}
        <div className="mb-2">
          <ProgressSteps steps={stepsWithoutThinking.steps} />
        </div>
        {stepsWithoutThinking.remainingText && (
          <div className={cn(isSubmitting ? 'result-streaming' : '')}>
            <Markdown
              content={stepsWithoutThinking.remainingText}
              isLatestMessage={isLatestMessage}
            />
          </div>
        )}
      </div>
    );
  }

  const exportButtons = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="not-prose bg-surface-secondary/50 flex items-center gap-2 rounded-lg border border-border-light px-3 py-1.5"
    >
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleExportCSV}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        title="Export as CSV"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleExportExcel}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        title="Export as Excel"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </motion.button>
      {canCreateChart && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsChartModalOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          title="Create Chart"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Chart
        </motion.button>
      )}
      <span className="text-xs text-text-tertiary">
        {tableData.rows.length} row{tableData.rows.length !== 1 ? 's' : ''}
      </span>
    </motion.div>
  );

  return (
    <div className="relative">
      {/* Render thinking/reasoning content using Reasoning component */}
      {thinkingContent && (
        <div className="mb-4">
          <Reasoning reasoning={thinkingContent} isLast={isLatestMessage} />
        </div>
      )}

      {/* Render content before "Query Results:" (excluding SQL query which is in the tab) */}
      <div className="mb-3">
        <ProgressSteps steps={preResultsSteps.steps} />
        {preResultsSteps.remainingText && (
          <Markdown
            content={removeSqlSection(preResultsSteps.remainingText)}
            isLatestMessage={false}
          />
        )}
      </div>

      {/* Tabs for SQL Query and Results - Styled like Settings Modal */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Tabs.Root defaultValue="results" className="flex flex-col">
          {/* Tab Header with Export Buttons */}
          <div className="flex items-center justify-between px-3 py-2">
            <Tabs.List className="flex gap-1">
              <Tabs.Trigger
                value="results"
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  'radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
                )}
              >
                <Table className="h-4 w-4" />
                Results
              </Tabs.Trigger>
              <Tabs.Trigger
                value="sql"
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  'radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
                )}
              >
                <Code className="h-4 w-4" />
                SQL Query
              </Tabs.Trigger>
            </Tabs.List>

            {/* Export Buttons - Only show on Results tab context */}
            <div className="flex items-center">{exportButtons}</div>
          </div>

          {/* Tab Content */}
          <div>
            {/* Results Tab */}
            <Tabs.Content value="results" tabIndex={-1}>
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="p-3">
                  <Markdown
                    content={parsedContent.tableContent
                      .replace(/\*\*Query Results:\*\*/i, '')
                      .trim()}
                    isLatestMessage={false}
                  />
                </div>
              </motion.div>
            </Tabs.Content>

            {/* SQL Query Tab */}
            <Tabs.Content value="sql" tabIndex={-1}>
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="p-3">
                  {parsedSql ? (
                    <Markdown content={`\`\`\`sql\n${parsedSql}\n\`\`\``} isLatestMessage={false} />
                  ) : (
                    <div className="text-sm italic text-text-secondary">No SQL query available</div>
                  )}
                </div>
              </motion.div>
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </motion.div>

      {/* Chart Builder Modal */}
      <AnimatePresence>
        {canCreateChart && isChartModalOpen && (
          <Suspense fallback={null}>
            <ChartBuilderModal
              open={isChartModalOpen}
              onOpenChange={setIsChartModalOpen}
              tableData={tableData}
              queryRef={queryRef}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
