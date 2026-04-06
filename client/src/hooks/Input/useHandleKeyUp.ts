import { useCallback, useMemo } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import store from '~/store';

// Check if text context suggests SQL/analytics query
const isQueryContext = (text: string): boolean => {
  const queryKeywords = ['sql', 'query', 'select', 'database', 'table', 'analytics'];
  const lowerText = text.toLowerCase();
  return queryKeywords.some(keyword => lowerText.includes(keyword));
};

/** Event Keys that shouldn't trigger a command */
const invalidKeys = {
  Escape: true,
  Backspace: true,
  Enter: true,
};

/**
 * Utility function to determine if a command should trigger at start of input.
 */
const shouldTriggerCommand = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
  commandChar: string,
) => {
  const text = textAreaRef.current?.value;
  if (typeof text !== 'string' || text.length === 0 || text[0] !== commandChar) {
    return false;
  }

  const startPos = textAreaRef.current?.selectionStart;
  if (typeof startPos !== 'number') {
    return false;
  }

  return startPos === 1;
};

/**
 * Utility function to check if @ was just typed (at cursor position).
 */
const shouldTriggerAtAnywhere = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
) => {
  const text = textAreaRef.current?.value;
  const cursorPos = textAreaRef.current?.selectionStart;
  
  if (typeof text !== 'string' || text.length === 0 || typeof cursorPos !== 'number') {
    return false;
  }

  // Check if the character just before cursor is @
  const charBeforeCursor = text[cursorPos - 1];
  if (charBeforeCursor !== '@') {
    return false;
  }

  // Check if @ is at start or preceded by a space
  if (cursorPos === 1) {
    return true;
  }
  
  const charBeforeAt = text[cursorPos - 2];
  return charBeforeAt === ' ' || charBeforeAt === '\n';
};

/**
 * Custom hook for handling key up events with command triggers.
 */
const useHandleKeyUp = ({
  index,
  textAreaRef,
  setShowPlusPopover,
  setShowMentionPopover,
  setShowSavedQueriesPopover,
}: {
  index: number;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  setShowPlusPopover: SetterOrUpdater<boolean>;
  setShowMentionPopover: SetterOrUpdater<boolean>;
  setShowSavedQueriesPopover: SetterOrUpdater<boolean>;
}) => {
  const hasPromptsAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasMultiConvoAccess = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));
  const setShowPromptsPopover = useSetRecoilState(store.showPromptsPopoverFamily(index));

  // Get the current state of command toggles
  const atCommandEnabled = useRecoilValue(store.atCommand);
  const plusCommandEnabled = useRecoilValue(store.plusCommand);
  const slashCommandEnabled = useRecoilValue(store.slashCommand);

  const handleAtCommand = useCallback(() => {
    if (!atCommandEnabled) {
      return;
    }
    // Show saved queries popover when @ is typed anywhere (at start or after space)
    if (shouldTriggerAtAnywhere(textAreaRef)) {
      setShowSavedQueriesPopover(true);
    }
  }, [textAreaRef, setShowSavedQueriesPopover, atCommandEnabled]);

  const handlePlusCommand = useCallback(() => {
    if (!hasMultiConvoAccess || !plusCommandEnabled) {
      return;
    }
    if (shouldTriggerCommand(textAreaRef, '+')) {
      setShowPlusPopover(true);
    }
  }, [textAreaRef, setShowPlusPopover, plusCommandEnabled, hasMultiConvoAccess]);

  const handlePromptsCommand = useCallback(() => {
    if (!hasPromptsAccess || !slashCommandEnabled) {
      return;
    }
    if (shouldTriggerCommand(textAreaRef, '/')) {
      setShowPromptsPopover(true);
    }
  }, [textAreaRef, hasPromptsAccess, setShowPromptsPopover, slashCommandEnabled]);

  const commandHandlers = useMemo(
    () => ({
      '@': handleAtCommand,
      '+': handlePlusCommand,
      '/': handlePromptsCommand,
      'q': () => {
        // Quick check for @q pattern to trigger saved queries
        const text = textAreaRef.current?.value || '';
        if (text.startsWith('@q') && setShowSavedQueriesPopover) {
          setShowSavedQueriesPopover(true);
        }
      },
    }),
    [handleAtCommand, handlePlusCommand, handlePromptsCommand, setShowSavedQueriesPopover, textAreaRef],
  );

  const handleUpArrow = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!latestMessage) {
        return;
      }

      const element = document.getElementById(`edit-${latestMessage.parentMessageId}`);
      if (!element) {
        return;
      }
      event.preventDefault();
      element.click();
    },
    [latestMessage],
  );

  /**
   * Main key up handler.
   */
  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const text = textAreaRef.current?.value;
      if (event.key === 'ArrowUp' && text?.length === 0) {
        handleUpArrow(event);
        return;
      }
      if (typeof text !== 'string' || text.length === 0) {
        return;
      }

      if (invalidKeys[event.key as keyof typeof invalidKeys]) {
        return;
      }

      // Check for @ anywhere in text (for saved queries)
      if (event.key === '@') {
        handleAtCommand();
        return;
      }

      const firstChar = text[0];
      const handler = commandHandlers[firstChar as keyof typeof commandHandlers];

      if (typeof handler === 'function') {
        handler();
      }
    },
    [textAreaRef, commandHandlers, handleUpArrow, handleAtCommand],
  );

  return handleKeyUp;
};

export default useHandleKeyUp;
