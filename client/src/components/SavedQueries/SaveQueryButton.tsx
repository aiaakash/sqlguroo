import React, { useState, useCallback } from 'react';
import { Save, Check, X } from 'lucide-react';
import { useCreateSavedQueryMutation } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Button,
  Input,
  Label,
} from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SaveQueryButtonProps {
  sqlContent: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  className?: string;
}

export const SaveQueryButton: React.FC<SaveQueryButtonProps> = ({
  sqlContent,
  conversationId,
  messageId,
  connectionId,
  className,
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  const createSavedQuery = useCreateSavedQueryMutation();

  const handleSave = useCallback(async () => {
    if (!queryName.trim()) {
      return;
    }

    try {
      await createSavedQuery.mutateAsync({
        name: queryName.trim(),
        sqlContent: sqlContent.trim(),
        conversationId,
        messageId,
        connectionId,
      });

      setIsSaved(true);
      setIsModalOpen(false);
      showToast({
        message: localize('com_saved_queries_save_success', { name: queryName.trim() }),
        severity: NotificationSeverity.SUCCESS,
      });

      // Reset saved state after 3 seconds
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      showToast({
        message: localize('com_saved_queries_save_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  }, [
    queryName,
    sqlContent,
    conversationId,
    messageId,
    connectionId,
    createSavedQuery,
    showToast,
    localize,
  ]);

  const openModal = useCallback(() => {
    // Generate a default name based on first line of SQL
    const firstLine = sqlContent.split('\n')[0].trim();
    const defaultName = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    setQueryName(defaultName);
    setIsModalOpen(true);
  }, [sqlContent]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setQueryName('');
  }, []);

  if (!sqlContent?.trim()) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={openModal}
        disabled={isSaved}
        className={
          className ||
          'flex items-center justify-center rounded p-1.5 hover:bg-gray-700 focus:bg-gray-700 focus:outline focus:outline-white text-gray-200'
        }
        title={localize('com_saved_queries_save_button')}
      >
        {isSaved ? (
          <Check className="h-[18px] w-[18px] text-green-400" />
        ) : (
          <Save className="h-[18px] w-[18px]" />
        )}
      </Button>

      <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <OGDialogContent className="w-full max-w-lg overflow-hidden rounded-xl bg-card p-0 shadow-2xl backdrop-blur-2xl">
          <OGDialogHeader className="flex items-center justify-between border-b border-border-light px-6 py-4">
            <OGDialogTitle className="text-lg font-medium text-text-primary">
              {localize('com_saved_queries_modal_title')}
            </OGDialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-md p-1 text-text-secondary opacity-70 transition-opacity hover:bg-surface-hover hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy"
              onClick={closeModal}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">{localize('com_ui_close')}</span>
            </Button>
          </OGDialogHeader>

          <div className="p-6">
            {/* Query Name Input */}
            <div className="mb-4">
              <Label
                htmlFor="queryName"
                className="mb-2 block text-sm font-medium text-text-primary"
              >
                {localize('com_saved_queries_name_label')}
              </Label>
              <Input
                id="queryName"
                type="text"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
                maxLength={100}
                placeholder={localize('com_saved_queries_name_placeholder')}
                className={cn(
                  'w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-text-primary',
                  'border-border-light focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                  'dark:border-border-dark dark:focus:border-blue-400 dark:focus:ring-blue-400',
                  'placeholder:text-text-tertiary',
                )}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  } else if (e.key === 'Escape') {
                    closeModal();
                  }
                }}
              />
              <div className="mt-1 text-right text-xs text-text-tertiary">
                {queryName.length}/100
              </div>
            </div>

            {/* SQL Preview */}
            <div className="mb-6">
              <Label className="mb-2 block text-sm font-medium text-text-primary">
                {localize('com_saved_queries_sql_preview')}
              </Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border-light bg-surface-secondary p-3 dark:border-border-dark dark:bg-surface-tertiary">
                <code className="block whitespace-pre-wrap font-mono text-xs text-text-secondary">
                  {sqlContent.length > 300 ? sqlContent.substring(0, 300) + '...' : sqlContent}
                </code>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeModal}
              >
                {localize('com_ui_cancel')}
              </Button>
              <Button
                type="button"
                variant="submit"
                onClick={handleSave}
                disabled={!queryName.trim() || createSavedQuery.isLoading}
              >
                {createSavedQuery.isLoading
                  ? localize('com_ui_saving')
                  : localize('com_ui_save')}
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
};

export default SaveQueryButton;
