import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '~/utils';

export interface Step {
  name: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  originalIndex: number;
}

interface ProgressStepsProps {
  steps: Step[];
}

const stepVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.15,
    },
  },
};

const iconVariants = {
  initial: { scale: 0, rotate: -180 },
  animate: { 
    scale: 1, 
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 30,
    }
  },
  exit: { 
    scale: 0,
    rotate: 180,
    transition: {
      duration: 0.2,
    }
  },
};

export default function ProgressSteps({ steps }: ProgressStepsProps) {
  if (!steps || steps.length === 0) return null;

  // Find the current active step:
  // 1. First running step, OR
  // 2. Last completed step if no running steps
  const runningStep = steps.find(s => s.status === 'running');
  const errorStep = steps.find(s => s.status === 'error');
  
  // Priority: error > running > last completed
  let currentStep: Step | undefined;
  if (errorStep) {
    currentStep = errorStep;
  } else if (runningStep) {
    currentStep = runningStep;
  } else {
    // No running or error, show the last completed step
    const completedSteps = steps.filter(s => s.status === 'completed');
    if (completedSteps.length > 0) {
      currentStep = completedSteps[completedSteps.length - 1];
    }
  }

  if (!currentStep) return null;

  return (
    <div className="not-prose mb-4 flex flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.name}
          variants={stepVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="flex items-center gap-3 rounded-lg p-2"
        >
          {/* Icon */}
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <AnimatePresence mode="wait">
              {currentStep.status === 'running' && (
                <motion.div
                  key="running"
                  variants={iconVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-4 w-4 text-blue-500" />
                  </motion.div>
                </motion.div>
              )}
              {currentStep.status === 'completed' && (
                <motion.div
                  key="completed"
                  variants={iconVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </motion.div>
              )}
              {currentStep.status === 'error' && (
                <motion.div
                  key="error"
                  variants={iconVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <XCircle className="h-4 w-4 text-red-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Step Name */}
          <div className="flex flex-col">
            <motion.span
              animate={{
                color: currentStep.status === 'running' ? 'rgb(var(--colors-text-primary))' : 'rgb(var(--colors-text-secondary))',
              }}
              transition={{ duration: 0.2 }}
              className={cn(
                'text-sm font-medium',
                currentStep.status === 'running' && 'text-text-primary',
                currentStep.status === 'completed' && 'text-text-secondary',
                currentStep.status === 'error' && 'text-red-500'
              )}
            >
              {currentStep.name}
            </motion.span>
            
            {/* Error message */}
            <AnimatePresence>
              {currentStep.error && (
                <motion.span
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-red-400"
                >
                  {currentStep.error}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
