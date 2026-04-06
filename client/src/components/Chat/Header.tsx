import { useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { useMediaQuery, TooltipAnchor } from '@librechat/client';
import { useOutletContext } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Code } from 'lucide-react';
import { getConfigDefaults, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { PresetsMenu, HeaderNewChat, OpenSidebar } from './Menus';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import BookmarkMenu from './Menus/BookmarkMenu';
import { TemporaryChat } from './TemporaryChat';
import SqlLockToggle from './Input/SqlLockToggle';
import AddMultiConvo from './AddMultiConvo';
import UpgradeReminder from './UpgradeReminder';
import QuotaDisplay from './QuotaDisplay';
import { useHasAccess } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const [sqlExecutorVisibility, setSqlExecutorVisibility] = useRecoilState(store.sqlExecutorVisibility);

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-14 w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <AnimatePresence initial={false}>
            {!navVisible && (
              <motion.div
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                key="header-buttons"
              >
                <OpenSidebar setNavVisible={setNavVisible} className="max-md:hidden" />
                <HeaderNewChat />
              </motion.div>
            )}
          </AnimatePresence>
          {!(navVisible && isSmallScreen) && (
            <div
              className={cn(
                'flex items-center gap-2',
                !isSmallScreen ? 'transition-all duration-200 ease-in-out' : '',
                !navVisible && !isSmallScreen ? 'pl-2' : '',
              )}
            >
              <ModelSelector startupConfig={startupConfig} />
              {/* Preset button commented out */}
              {/* {interfaceConfig.presets === true && interfaceConfig.modelSelect && <PresetsMenu />} */}
              {hasAccessToBookmarks === true && <BookmarkMenu />}
              {/* Multi conversation button commented out - can be enabled in future if needed */}
              {/* {hasAccessToMultiConvo === true && <AddMultiConvo />} */}
              <UpgradeReminder />
              {isSmallScreen && (
                <>
                  <TooltipAnchor
                    description={sqlExecutorVisibility ? 'Hide SQL Editor' : 'Show SQL Editor'}
                    role="button"
                    tabIndex={0}
                    aria-label={sqlExecutorVisibility ? 'Hide SQL Editor' : 'Show SQL Editor'}
                    onClick={() => setSqlExecutorVisibility(!sqlExecutorVisibility)}
                    data-testid="sql-executor-toggle-button"
                    className={cn(
                      'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50',
                      sqlExecutorVisibility && 'bg-surface-tertiary',
                    )}
                  >
                    <Code className="icon-lg" aria-hidden="true" />
                  </TooltipAnchor>
                  {sqlExecutorVisibility && <SqlLockToggle />}
                  <QuotaDisplay />
                  <ExportAndShareMenu
                    isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
                  />
                  <TemporaryChat />
                </>
              )}
            </div>
          )}
        </div>

        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            <TooltipAnchor
              description={sqlExecutorVisibility ? 'Hide SQL Editor' : 'Show SQL Editor'}
              role="button"
              tabIndex={0}
              aria-label={sqlExecutorVisibility ? 'Hide SQL Editor' : 'Show SQL Editor'}
              onClick={() => setSqlExecutorVisibility(!sqlExecutorVisibility)}
              data-testid="sql-executor-toggle-button"
              className={cn(
                'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50',
                sqlExecutorVisibility && 'bg-surface-tertiary',
              )}
            >
              <Code className="icon-lg" aria-hidden="true" />
            </TooltipAnchor>
            {sqlExecutorVisibility && <SqlLockToggle />}
            <QuotaDisplay />
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
            <TemporaryChat />
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
