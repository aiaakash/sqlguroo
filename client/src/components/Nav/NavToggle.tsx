import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function NavToggle({
  onToggle,
  navVisible,
  isHovering,
  setIsHovering,
  side = 'left',
  className = '',
  translateX = true,
}: {
  onToggle: () => void;
  navVisible: boolean;
  isHovering: boolean;
  setIsHovering: (isHovering: boolean) => void;
  side?: 'left' | 'right';
  className?: string;
  translateX?: boolean;
}) {
  const localize = useLocalize();
  const transition = {
    transition: 'transform 0.3s ease, opacity 0.2s ease',
  };

  const rotationDegree = 15;
  const rotation = isHovering || !navVisible ? `${rotationDegree}deg` : '0deg';
  const topBarRotation = side === 'right' ? `-${rotation}` : rotation;
  const bottomBarRotation = side === 'right' ? rotation : `-${rotation}`;

  let sidebarLabel;
  let actionKey;

  if (side === 'left') {
    sidebarLabel = localize('com_ui_chat_history');
  } else {
    sidebarLabel = localize('com_nav_control_panel');
  }

  if (navVisible) {
    actionKey = 'com_ui_close_var';
  } else {
    actionKey = 'com_ui_open_var';
  }

  const ariaDescription = localize(actionKey, { 0: sidebarLabel });

  return (
    <div
      className={cn(
        className,
        '-translate-y-1/2 transition-transform',
        navVisible ? 'rotate-0' : 'rotate-180',
        navVisible && translateX ? 'translate-x-[260px]' : 'translate-x-0',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <TooltipAnchor
        side={side === 'right' ? 'left' : 'right'}
        aria-label={ariaDescription}
        aria-expanded={navVisible}
        aria-controls={side === 'left' ? 'chat-history-nav' : 'controls-nav'}
        id={`toggle-${side}-nav`}
        onClick={onToggle}
        role="button"
        description={ariaDescription}
        className="flex items-center justify-center"
        tabIndex={0}
      >
        <span className="" data-state="closed">
          <div
            className="flex h-[50px] w-6 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-blue-200 backdrop-blur-sm dark:bg-green-950/80 dark:ring-1 dark:ring-green-800"
            style={{ ...transition, opacity: isHovering ? 1 : 0.9 }}
          >
            <div className="flex h-4 w-4 flex-col items-center">
              {/* Top bar */}
              <div
                className="h-2 w-1 rounded-full bg-blue-600 dark:bg-green-400"
                style={{
                  ...transition,
                  transform: `translateY(0.1rem) rotate(${topBarRotation}) translateZ(0px)`,
                }}
              />
              {/* Bottom bar */}
              <div
                className="h-2 w-1 rounded-full bg-blue-600 dark:bg-green-400"
                style={{
                  ...transition,
                  transform: `translateY(-0.1rem) rotate(${bottomBarRotation}) translateZ(0px)`,
                }}
              />
            </div>
          </div>
        </span>
      </TooltipAnchor>
    </div>
  );
}
