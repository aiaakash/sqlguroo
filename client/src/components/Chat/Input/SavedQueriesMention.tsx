import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { Database } from 'lucide-react';
import { useGetAllSavedQueriesQuery } from 'librechat-data-provider';
import { removeCharIfLast } from '~/utils';
import MentionItem from './MentionItem';
import { useLocalize } from '~/hooks';
import store from '~/store';

const commandChar = '@';
const ROW_HEIGHT = 40;

interface SavedQueryOption {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  sqlContent: string;
}

interface SavedQueriesMentionProps {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onSelectQuery: (query: { name: string; sqlContent: string }) => void;
}

function SavedQueriesMention({ index, textAreaRef, onSelectQuery }: SavedQueriesMentionProps) {
  const localize = useLocalize();
  const { data: savedQueries, isLoading } = useGetAllSavedQueriesQuery();

  const [activeIndex, setActiveIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setShowSavedQueriesPopover = useSetRecoilState(store.showSavedQueriesPopoverFamily(index));
  const showSavedQueriesPopover = useRecoilValue(store.showSavedQueriesPopoverFamily(index));

  const queryOptions = useMemo<SavedQueryOption[]>(() => {
    if (!savedQueries) return [];
    return savedQueries.map((q) => ({
      id: q._id,
      label: q.name,
      description: q.sqlContent.substring(0, 100) + (q.sqlContent.length > 100 ? '...' : ''),
      icon: <Database className="h-4 w-4" />,
      sqlContent: q.sqlContent,
    }));
  }, [savedQueries]);

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '',
    options: queryOptions,
  });

  const handleSelect = useCallback(
    (mention?: SavedQueryOption) => {
      if (!mention) {
        return;
      }

      setSearchValue('');
      setOpen(false);
      setShowSavedQueriesPopover(false);

      if (textAreaRef.current) {
        removeCharIfLast(textAreaRef.current, commandChar);
      }

      onSelectQuery({
        name: mention.label,
        sqlContent: mention.sqlContent,
      });
    },
    [setSearchValue, setOpen, setShowSavedQueriesPopover, textAreaRef, onSelectQuery],
  );

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentActiveItem = document.getElementById(`saved-query-item-${activeIndex}`);
    currentActiveItem?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [activeIndex]);

  // Close popover when user clicks outside or presses escape
  useEffect(() => {
    if (!showSavedQueriesPopover) {
      setOpen(false);
    }
  }, [showSavedQueriesPopover, setOpen]);

  const rowRenderer = ({
    index,
    key,
    style,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
  }) => {
    const mention = matches[index] as SavedQueryOption;
    return (
      <MentionItem
        index={index}
        type="saved-query"
        key={key}
        style={style}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = null;
          handleSelect(mention);
        }}
        name={mention.label ?? ''}
        icon={mention.icon}
        description={mention.description}
        isActive={index === activeIndex}
      />
    );
  };

  if (!showSavedQueriesPopover) {
    return null;
  }

  return (
    <div className="absolute bottom-28 z-10 w-full space-y-2">
      <div className="popover border-token-border-light rounded-2xl border bg-surface-tertiary-alt p-2 shadow-lg">
        <div className="mb-2 flex items-center gap-2 border-b border-border-light pb-2">
          <Database className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">
            {localize('com_saved_queries_mention_title')}
          </span>
        </div>
        <input
          // The user expects focus to transition to the input field when the popover is opened
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          ref={inputRef}
          placeholder={localize('com_saved_queries_mention_placeholder')}
          className="mb-1 w-full border-0 bg-surface-tertiary-alt p-2 text-sm focus:outline-none dark:text-gray-200"
          autoComplete="off"
          value={searchValue}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setShowSavedQueriesPopover(false);
              textAreaRef.current?.focus();
            }
            if (e.key === 'ArrowDown') {
              setActiveIndex((prevIndex) => (prevIndex + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
              setActiveIndex((prevIndex) => (prevIndex - 1 + matches.length) % matches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
              handleSelect(matches[activeIndex] as SavedQueryOption | undefined);
            } else if (e.key === 'Backspace' && searchValue === '') {
              setOpen(false);
              setShowSavedQueriesPopover(false);
              textAreaRef.current?.focus();
            }
          }}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            timeoutRef.current = setTimeout(() => {
              setOpen(false);
              setShowSavedQueriesPopover(false);
            }, 150);
          }}
        />
        <div className="max-h-40 overflow-y-auto">
          {(() => {
            if (isLoading && open) {
              return (
                <div className="flex h-32 items-center justify-center text-text-primary">
                  <Spinner />
                </div>
              );
            }

            if (!isLoading && open) {
              if (matches.length === 0) {
                return (
                  <div className="flex h-20 items-center justify-center text-sm text-text-secondary">
                    {localize('com_saved_queries_no_results')}
                  </div>
                );
              }
              return (
                <div className="max-h-40">
                  <AutoSizer disableHeight>
                    {({ width }) => (
                      <List
                        width={width}
                        overscanRowCount={5}
                        rowHeight={ROW_HEIGHT}
                        rowCount={matches.length}
                        rowRenderer={rowRenderer}
                        scrollToIndex={activeIndex}
                        height={Math.min(matches.length * ROW_HEIGHT, 160)}
                      />
                    )}
                  </AutoSizer>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}

export default memo(SavedQueriesMention);
