import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type {
  TAnalyticsChatRequest,
  TAnalyticsChatResponse,
  TExecuteQueryRequest,
  TExecuteQueryResponse,
} from 'librechat-data-provider';

interface UseAnalyticsChatOptions {
  connectionId: string;
  onSuccess?: (response: TAnalyticsChatResponse) => void;
  onError?: (error: Error) => void;
}

export function useAnalyticsChat({ connectionId, onSuccess, onError }: UseAnalyticsChatOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<TAnalyticsChatResponse | null>(null);
  const queryClient = useQueryClient();

  const chatMutation = useMutation<TAnalyticsChatResponse, Error, TAnalyticsChatRequest>({
    mutationFn: (request) => dataService.sendAnalyticsChat(request),
    onSuccess: (response) => {
      setLastResponse(response);
      onSuccess?.(response);
    },
    onError: (error) => {
      onError?.(error);
    },
  });

  const executeMutation = useMutation<TExecuteQueryResponse, Error, TExecuteQueryRequest>({
    mutationFn: (request) => dataService.executeAnalyticsQuery(request),
  });

  const sendMessage = useCallback(
    async (
      question: string,
      options?: {
        conversationId?: string;
        parentMessageId?: string;
        autoExecute?: boolean;
      },
    ) => {
      setIsLoading(true);
      try {
        const response = await chatMutation.mutateAsync({
          question,
          connectionId,
          conversationId: options?.conversationId,
          parentMessageId: options?.parentMessageId,
          autoExecute: options?.autoExecute ?? true,
        });
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId, chatMutation],
  );

  const executeQuery = useCallback(
    async (sql: string, messageId?: string) => {
      setIsLoading(true);
      try {
        const response = await executeMutation.mutateAsync({
          sql,
          connectionId,
          messageId,
        });
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId, executeMutation],
  );

  return {
    sendMessage,
    executeQuery,
    isLoading,
    lastResponse,
    error: chatMutation.error || executeMutation.error,
  };
}

export default useAnalyticsChat;

