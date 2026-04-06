import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { getConfigDefaults } from 'librechat-data-provider';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useGetStartupConfig } from '~/data-provider';
import ArtifactsPanel from './ArtifactsPanel';
import SqlExecutorPanelWrapper from './SqlExecutorPanel';
import { normalizeLayout } from '~/utils';
import SidePanel from './SidePanel';
import store from '~/store';

interface SidePanelProps {
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
  fullPanelCollapse?: boolean;
  artifacts?: React.ReactNode;
  sqlExecutor?: React.ReactNode;
  children: React.ReactNode;
}

const defaultMinSize = 20;
const defaultInterface = getConfigDefaults().interface;

const SidePanelGroup = memo(
  ({
    defaultLayout = [97, 3],
    defaultCollapsed = false,
    fullPanelCollapse = false,
    navCollapsedSize = 3,
    artifacts,
    sqlExecutor,
    children,
  }: SidePanelProps) => {
    const { data: startupConfig } = useGetStartupConfig();
    const interfaceConfig = useMemo(
      () => startupConfig?.interface ?? defaultInterface,
      [startupConfig],
    );

    const panelRef = useRef<ImperativePanelHandle>(null);
    const [minSize, setMinSize] = useState(defaultMinSize);
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [fullCollapse, setFullCollapse] = useState(fullPanelCollapse);
    const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
    const [shouldRenderArtifacts, setShouldRenderArtifacts] = useState(artifacts != null);
    const [shouldRenderSqlExecutor, setShouldRenderSqlExecutor] = useState(sqlExecutor != null);

    const isSmallScreen = useMediaQuery('(max-width: 767px)');
    const hideSidePanel = useRecoilValue(store.hideSidePanel);

    const calculateLayout = useCallback(() => {
      const navSize = defaultLayout.length === 2 ? defaultLayout[1] : defaultLayout[2] || 3;
      const hasSql = sqlExecutor != null;
      const hasArtifacts = artifacts != null;

      if (!hasSql && !hasArtifacts) {
        return [100 - navSize, navSize];
      } else if (hasSql && !hasArtifacts) {
        const remainingSpace = 100 - navSize;
        const mainSize = Math.floor(remainingSpace * 0.6);
        const sqlSize = remainingSpace - mainSize;
        return [mainSize, sqlSize, navSize];
      } else if (!hasSql && hasArtifacts) {
        const remainingSpace = 100 - navSize;
        const mainSize = Math.floor(remainingSpace / 2);
        const artifactsSize = remainingSpace - mainSize;
        return [mainSize, artifactsSize, navSize];
      } else {
        // Has both SQL and artifacts
        const remainingSpace = 100 - navSize;
        const mainSize = Math.floor(remainingSpace * 0.4);
        const sqlSize = Math.floor(remainingSpace * 0.3);
        const artifactsSize = remainingSpace - mainSize - sqlSize;
        return [mainSize, sqlSize, artifactsSize, navSize];
      }
    }, [artifacts, sqlExecutor, defaultLayout]);

    const currentLayout = useMemo(() => normalizeLayout(calculateLayout()), [calculateLayout]);

    const throttledSaveLayout = useMemo(
      () =>
        throttle((sizes: number[]) => {
          const normalizedSizes = normalizeLayout(sizes);
          localStorage.setItem('react-resizable-panels:layout', JSON.stringify(normalizedSizes));
        }, 350),
      [],
    );

    useEffect(() => {
      if (isSmallScreen) {
        setIsCollapsed(true);
        setCollapsedSize(0);
        setMinSize(defaultMinSize);
        setFullCollapse(true);
        localStorage.setItem('fullPanelCollapse', 'true');
        panelRef.current?.collapse();
        return;
      } else {
        setIsCollapsed(defaultCollapsed);
        setCollapsedSize(navCollapsedSize);
        setMinSize(defaultMinSize);
      }
    }, [isSmallScreen, defaultCollapsed, navCollapsedSize, fullPanelCollapse]);

    const minSizeMain = useMemo(() => {
      if (sqlExecutor != null || artifacts != null) return 15;
      return 30;
    }, [sqlExecutor, artifacts]);

    /** Memoized close button handler to prevent re-creating it */
    const handleClosePanel = useCallback(() => {
      setIsCollapsed(() => {
        localStorage.setItem('fullPanelCollapse', 'true');
        setFullCollapse(true);
        setCollapsedSize(0);
        setMinSize(0);
        return false;
      });
      panelRef.current?.collapse();
    }, []);

    return (
      <>
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes) => throttledSaveLayout(sizes)}
          className="relative h-full w-full flex-1 overflow-auto bg-presentation"
        >
          <ResizablePanel
            defaultSize={currentLayout[0]}
            minSize={minSizeMain}
            order={1}
            id="messages-view"
          >
            {children}
          </ResizablePanel>

          {!isSmallScreen && (
            <SqlExecutorPanelWrapper
              sqlExecutor={sqlExecutor}
              currentLayout={currentLayout}
              minSizeMain={minSizeMain}
              shouldRender={shouldRenderSqlExecutor}
              onRenderChange={setShouldRenderSqlExecutor}
            />
          )}

          {!isSmallScreen && (
            <ArtifactsPanel
              artifacts={artifacts}
              currentLayout={currentLayout}
              minSizeMain={minSizeMain}
              shouldRender={shouldRenderArtifacts}
              onRenderChange={setShouldRenderArtifacts}
            />
          )}

          {!hideSidePanel && interfaceConfig.sidePanel === true && (
            <SidePanel
              panelRef={panelRef}
              minSize={minSize}
              setMinSize={setMinSize}
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
              collapsedSize={collapsedSize}
              setCollapsedSize={setCollapsedSize}
              fullCollapse={fullCollapse}
              setFullCollapse={setFullCollapse}
              interfaceConfig={interfaceConfig}
              hasArtifacts={shouldRenderArtifacts}
              hasSqlExecutor={shouldRenderSqlExecutor}
              defaultSize={currentLayout[currentLayout.length - 1]}
            />
          )}
        </ResizablePanelGroup>
        {artifacts != null && isSmallScreen && (
          <div className="fixed inset-0 z-[100]">{artifacts}</div>
        )}
        {sqlExecutor != null && isSmallScreen && (
          <div className="fixed inset-0 z-[100]">{sqlExecutor}</div>
        )}
        {!hideSidePanel && interfaceConfig.sidePanel === true && (
          <button
            aria-label="Close right side panel"
            className={`nav-mask ${!isCollapsed ? 'active' : ''}`}
            onClick={handleClosePanel}
          />
        )}
      </>
    );
  },
);

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
