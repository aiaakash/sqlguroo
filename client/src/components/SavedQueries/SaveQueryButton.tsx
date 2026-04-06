import React, { useState, useCallback } from 'react';
import { Save, Check, X } from 'lucide-react';
import { useCreateSavedQueryMutation } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
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
      <button
        type="button"
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
      </button>

      <Transition appear show={isModalOpen}>
        <Dialog as="div" className="relative z-[100]" onClose={closeModal}>
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black opacity-50 dark:opacity-80" aria-hidden="true" />
          </TransitionChild>

          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
              <DialogPanel
                className={cn(
                  'w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-2xl backdrop-blur-2xl animate-in',
                  'border border-border-light dark:border-border-dark',
                )}
              >
                {/* Header */}
                <DialogTitle
                  className="flex items-center justify-between border-b border-border-light px-6 py-4 dark:border-border-dark"
                  as="div"
                >
                  <h2 className="text-lg font-medium text-text-primary">
                    {localize('com_saved_queries_modal_title')}
                  </h2>
                  <button
                    type="button"
                    className="rounded-md p-1 text-text-secondary opacity-70 transition-opacity hover:bg-surface-hover hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy"
                    onClick={closeModal}
                  >
                    <X className="h-5 w-5" />
                    <span className="sr-only">{localize('com_ui_close')}</span>
                  </button>
                </DialogTitle>

                {/* Content */}
                <div className="p-6">
                  {/* Query Name Input */}
                  <div className="mb-4">
                    <label
                      htmlFor="queryName"
                      className="mb-2 block text-sm font-medium text-text-primary"
                    >
                      {localize('com_saved_queries_name_label')}
                    </label>
                    <input
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
                    <label className="mb-2 block text-sm font-medium text-text-primary">
                      {localize('com_saved_queries_sql_preview')}
                    </label>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border-light bg-surface-secondary p-3 dark:border-border-dark dark:bg-surface-tertiary">
                      <code className="block whitespace-pre-wrap font-mono text-xs text-text-secondary">
                        {sqlContent.length > 300 ? sqlContent.substring(0, 300) + '...' : sqlContent}
                      </code>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className={cn(
                        'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                        'border-border-light bg-transparent text-text-primary hover:bg-surface-hover',
                        'dark:border-border-dark dark:hover:bg-surface-tertiary',
                        'focus:outline-none focus:ring-2 focus:ring-border-xheavy',
                      )}
                    >
                      {localize('com_ui_cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!queryName.trim() || createSavedQuery.isLoading}
                      className={cn(
                        'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                        'bg-blue-600 hover:bg-blue-700',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        'dark:focus:ring-offset-surface-primary',
                      )}
                    >
                      {createSavedQuery.isLoading
                        ? localize('com_ui_saving')
                        : localize('com_ui_save')}
                    </button>
                  </div>
                </div>
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  );
};

export default SaveQueryButton;
