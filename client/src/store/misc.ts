import { atom, selectorFamily } from 'recoil';
import { TAttachment } from 'librechat-data-provider';
import { atomWithLocalStorage } from './utils';
import { BadgeItem } from '~/common';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({
  key: 'messageAttachmentsMap',
  default: {},
});

/**
 * Selector to get attachments for a specific conversation.
 */
const conversationAttachmentsSelector = selectorFamily<
  Record<string, TAttachment[]>,
  string | undefined
>({
  key: 'conversationAttachments',
  get:
    (conversationId) =>
    ({ get }) => {
      if (!conversationId) {
        return {};
      }

      const attachmentsMap = get(messageAttachmentsMap);
      const result: Record<string, TAttachment[]> = {};

      // Filter to only include attachments for this conversation
      Object.entries(attachmentsMap).forEach(([messageId, attachments]) => {
        if (!attachments || attachments.length === 0) {
          return;
        }

        const relevantAttachments = attachments.filter(
          (attachment) => attachment.conversationId === conversationId,
        );

        if (relevantAttachments.length > 0) {
          result[messageId] = relevantAttachments;
        }
      });

      return result;
    },
});

const queriesEnabled = atom<boolean>({
  key: 'queriesEnabled',
  default: true,
});

const isEditingBadges = atom<boolean>({
  key: 'isEditingBadges',
  default: false,
});

const chatBadges = atomWithLocalStorage<Pick<BadgeItem, 'id'>[]>('chatBadges', [
  // When adding new badges, make sure to add them to useChatBadges.ts as well and add them as last item
  // DO NOT CHANGE THE ORDER OF THE BADGES ALREADY IN THE ARRAY
  { id: '1' },
  // { id: '2' },
]);

// Store selected analytics model (for LLM used in SQL generation)
const analyticsModel = atomWithLocalStorage<string | null>('analyticsModel', null);

// Store selected agent type (react or legacy/orchestrator)
const agentType = atomWithLocalStorage<'react' | 'legacy'>('agentType', 'react');

// SQL Executor panel visibility
const sqlExecutorVisibility = atomWithLocalStorage<boolean>('sqlExecutorVisibility', false);

// SQL Editor lock toggle - when enabled, SQL from chat is synced to editor
// and user messages reference the editor's current SQL
const sqlEditorLock = atomWithLocalStorage<boolean>('sqlEditorLock', false);

// Current SQL content in the editor (for sharing between components)
const sqlEditorContent = atom<string>({
  key: 'sqlEditorContent',
  default: '',
});

export default {
  hideBannerHint,
  messageAttachmentsMap,
  conversationAttachmentsSelector,
  queriesEnabled,
  isEditingBadges,
  chatBadges,
  analyticsModel,
  agentType,
  sqlExecutorVisibility,
  sqlEditorLock,
  sqlEditorContent,
};
