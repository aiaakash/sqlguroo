import React from 'react';
import { useRecoilState } from 'recoil';
import { Lock, LockOpen } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { cn } from '~/utils';
import store from '~/store';

interface SqlLockToggleProps {
  className?: string;
}

/**
 * SqlLockToggle component - A toggle switch for the SQL Editor Lock feature
 * 
 * When enabled (locked):
 * - Generated SQL from chat is automatically displayed in the query editor
 * - User messages reference the SQL currently in the editor
 * - This allows data analysts to work in sync with AI chatting and editing their code
 */
export default function SqlLockToggle({ className }: SqlLockToggleProps) {
  const [sqlEditorLock, setSqlEditorLock] = useRecoilState(store.sqlEditorLock);

  return (
    <TooltipAnchor
      description={sqlEditorLock 
        ? 'SQL Lock: Editor content is synced with chat'
        : 'SQL Lock: Click to sync editor with chat'
      }
      role="button"
      tabIndex={0}
      aria-label={sqlEditorLock ? 'Disable SQL Lock' : 'Enable SQL Lock'}
      onClick={() => setSqlEditorLock(!sqlEditorLock)}
      data-testid="sql-lock-toggle-button"
      className={cn(
        'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50',
        sqlEditorLock 
          ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' 
          : 'bg-presentation text-text-primary',
        className,
      )}
    >
      {sqlEditorLock ? (
        <Lock className="icon-lg" aria-hidden="true" />
      ) : (
        <LockOpen className="icon-lg" aria-hidden="true" />
      )}
    </TooltipAnchor>
  );
}
