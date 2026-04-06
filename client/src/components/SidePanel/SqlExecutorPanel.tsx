import { useRef, useEffect, memo } from 'react';
import { ResizableHandleAlt, ResizablePanel } from '@librechat/client';
import type { ImperativePanelHandle } from 'react-resizable-panels';
// Note: SqlExecutorPanel is passed as children, not imported

interface SqlExecutorPanelProps {
  sqlExecutor: React.ReactNode | null;
  currentLayout: number[];
  minSizeMain: number;
  shouldRender: boolean;
  onRenderChange: (shouldRender: boolean) => void;
}

/**
 * SqlExecutorPanel component - memoized to prevent unnecessary re-renders
 * Only re-renders when SQL executor visibility or layout changes
 */
const SqlExecutorPanelWrapper = memo(function SqlExecutorPanelWrapper({
  sqlExecutor,
  currentLayout,
  minSizeMain,
  shouldRender,
  onRenderChange,
}: SqlExecutorPanelProps) {
  const sqlPanelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (sqlExecutor != null) {
      onRenderChange(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sqlPanelRef.current?.expand();
        });
      });
    } else if (shouldRender) {
      onRenderChange(false);
    }
  }, [sqlExecutor, shouldRender, onRenderChange]);

  if (!shouldRender) {
    return null;
  }

  // Calculate SQL panel size - it should be between main and artifacts
  // Layout: [main, sql, artifacts, nav] or [main, sql, nav]
  const sqlPanelIndex = 1;
  const sqlPanelSize = sqlExecutor != null ? (currentLayout[sqlPanelIndex] || 0) : 0;

  return (
    <>
      {sqlExecutor != null && (
        <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
      )}
      <ResizablePanel
        ref={sqlPanelRef}
        defaultSize={sqlExecutor != null ? sqlPanelSize : 0}
        minSize={minSizeMain}
        maxSize={75}
        collapsible={true}
        collapsedSize={0}
        order={2}
        id="sql-executor-panel"
      >
        <div className="h-full min-w-[400px] overflow-hidden">{sqlExecutor}</div>
      </ResizablePanel>
    </>
  );
});

SqlExecutorPanelWrapper.displayName = 'SqlExecutorPanelWrapper';

export default SqlExecutorPanelWrapper;
