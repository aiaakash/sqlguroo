import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '~/utils';

interface SqlEditorReferenceProps {
  text: string;
}

/**
 * Parses text to separate the user's actual message from the SQL editor reference
 */
function parseMessageWithSqlRef(text: string): {
  userMessage: string;
  sqlContent: string | null;
} {
  if (!text) return { userMessage: '', sqlContent: null };
  
  // Look for the SQL editor reference pattern (more flexible matching)
  const sqlRefMatch = text.match(/\n*\[Current SQL in Editor\]:\s*\n```sql\n([\s\S]*?)```\s*$/i);
  
  if (sqlRefMatch && sqlRefMatch[1]) {
    const sqlContent = sqlRefMatch[1].trim();
    const markerIndex = text.toLowerCase().indexOf('[current sql in editor]:');
    const userMessage = text.substring(0, markerIndex).trim();
    return { userMessage, sqlContent };
  }
  
  return { userMessage: text, sqlContent: null };
}

/**
 * SqlEditorReference component - Displays a compact UI for SQL editor reference
 * 
 * Shows a collapsible line with chain icon that expands to show the SQL query
 */
export default function SqlEditorReference({ text }: SqlEditorReferenceProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { userMessage, sqlContent } = useMemo(() => parseMessageWithSqlRef(text), [text]);

  // If no SQL reference, just return the text as-is
  if (!sqlContent) {
    return <>{text}</>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* User's actual message */}
      {userMessage && (
        <div className="whitespace-pre-wrap">{userMessage}</div>
      )}
      
      {/* Compact SQL Reference Line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5',
          'bg-surface-tertiary/50 border-border-light',
          'hover:bg-surface-tertiary transition-colors cursor-pointer',
          isExpanded && 'bg-surface-tertiary'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Chain Icon */}
        <Link2 className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
        
        {/* Label */}
        <span className="text-xs font-medium text-text-secondary flex-1">
          Referencing SQL Editor
        </span>
        
        {/* Expand/Collapse Icon */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
        </motion.div>
      </motion.div>
      
      {/* Expandable SQL Query */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-border-light bg-surface-tertiary/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
                  Current SQL
                </span>
                <div className="h-px flex-1 bg-border-light" />
              </div>
              <pre className="max-h-48 overflow-auto text-xs font-mono text-text-primary">
                <code>{sqlContent}</code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Check if text contains SQL editor reference
 */
export function hasSqlEditorReference(text: string): boolean {
  if (!text) return false;
  return /\[Current SQL in Editor\]:\s*\n```sql\n[\s\S]*?```/i.test(text);
}

/**
 * Extract just the user's message without the SQL reference
 */
export function extractUserMessage(text: string): string {
  const { userMessage } = parseMessageWithSqlRef(text);
  return userMessage || text;
}
