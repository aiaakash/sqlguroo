import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import CancelledIcon from './CancelledIcon';
import FinishedIcon from './FinishedIcon';
import { cn } from '~/utils';

const wrapperClass =
  'progress-text-wrapper text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5';

const Wrapper = ({ popover, children }: { popover: boolean; children: React.ReactNode }) => {
  if (popover) {
    return (
      <div className={wrapperClass}>
        <Popover.Trigger asChild>
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="progress-text-content absolute left-0 top-0 overflow-visible whitespace-nowrap"
            style={{ opacity: 1, transform: 'none' }}
            data-projection-id="78"
          >
            {children}
          </motion.div>
        </Popover.Trigger>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="progress-text-content absolute left-0 top-0 overflow-visible whitespace-nowrap"
        style={{ opacity: 1, transform: 'none' }}
        data-projection-id="78"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default function ProgressText({
  progress,
  onClick,
  inProgressText,
  finishedText,
  authText,
  hasInput = true,
  popover = false,
  isExpanded = false,
  error = false,
}: {
  progress: number;
  onClick?: () => void;
  inProgressText: string;
  finishedText: string;
  authText?: string;
  hasInput?: boolean;
  popover?: boolean;
  isExpanded?: boolean;
  error?: boolean;
}) {
  const getText = () => {
    if (error) {
      return finishedText;
    }
    if (progress < 1) {
      return authText ?? inProgressText;
    }
    return finishedText;
  };

  const getIcon = () => {
    if (error) {
      return <CancelledIcon />;
    }
    if (progress < 1) {
      // Rotating circle loader - consistent with other loading states
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="h-4 w-4" />
        </motion.div>
      );
    }
    return <FinishedIcon />;
  };

  const text = getText();
  const icon = getIcon();

  return (
    <Wrapper popover={popover}>
      <motion.button
        type="button"
        whileHover={hasInput ? { scale: 1.02 } : {}}
        whileTap={hasInput ? { scale: 0.98 } : {}}
        className={cn(
          'inline-flex w-full items-center gap-2 transition-all duration-200',
          hasInput ? 'cursor-pointer' : 'pointer-events-none',
        )}
        disabled={!hasInput}
        onClick={hasInput ? onClick : undefined}
        aria-expanded={hasInput ? isExpanded : undefined}
      >
        <span className="flex items-center justify-center">{icon}</span>
        <span>{text}</span>
        {hasInput && (
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {isExpanded ? (
              <ChevronUp className="size-4 shrink-0 translate-y-[1px]" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 shrink-0 translate-y-[1px]" aria-hidden="true" />
            )}
          </motion.span>
        )}
      </motion.button>
    </Wrapper>
  );
}
