import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import CloseAIExportButtons from '~/components/Chat/Messages/Content/CloseAIExportButtons';
import SqlEditorReference, { hasSqlEditorReference } from './SqlEditorReference';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  // Check if the text contains Query Results OR Progress Steps
  // We want to use the CloseAIExportButtons component if we see either the table or the progress steps
  const shouldUseCloseAIRenderer = useMemo(
    () => {
      if (isCreatedByUser) return false;

      // Check for Query Results header
      if (text.includes('**Query Results:**')) return true;

      // Check for Progress Step markers (►, ✓, ✗) at the start of the text or new lines
      // We check the first few lines to avoid false positives in long text
      const firstFewLines = text.split('\n').slice(0, 10).join('\n');
      return /^(?:►|✓|✗) /m.test(firstFewLines);
    },
    [isCreatedByUser, text],
  );

  // Check if user message contains SQL editor reference (from SQL Lock feature)
  const hasSqlRef = useMemo(() => isCreatedByUser && hasSqlEditorReference(text), [isCreatedByUser, text]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={text} isLatestMessage={isLatestMessage} />;
    } else if (hasSqlRef) {
      // Use professional UI for SQL editor reference
      return <SqlEditorReference text={text} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    } else {
      return <>{text}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, text, isLatestMessage, hasSqlRef]);

  // If this is an assistant message with query results or progress steps, let CloseAIExportButtons handle all rendering
  if (shouldUseCloseAIRenderer) {
    return (
      <div
        className={cn(
          isSubmitting ? 'submitting' : '',
          isSubmitting ? 'submitting' : '',
          showCursorState && !!text.length && !shouldUseCloseAIRenderer ? 'result-streaming' : '',
          'markdown prose message-content dark:prose-invert light w-full break-words dark:text-gray-100',
        )}
      >
        <CloseAIExportButtons text={text} />
      </div>
    );
  }

  // Normal rendering for messages without query results
  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
    </div>
  );
});

export default TextPart;
