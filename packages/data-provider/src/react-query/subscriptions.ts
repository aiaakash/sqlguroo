import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import * as dataService from '../data-service';
import { QueryKeys } from '../keys';
import * as t from '../types/subscription';

/* Subscription React Query Hooks */

export const useGetSubscriptionQuery = (
  config?: UseQueryOptions<t.ISubscriptionResponse>,
): QueryObserverResult<t.ISubscriptionResponse> => {
  return useQuery<t.ISubscriptionResponse>(
    [QueryKeys.subscription],
    () => dataService.getSubscription(),
    {
      refetchOnWindowFocus: false, // Disabled to prevent refetch when Paddle overlay opens
      refetchOnMount: true,
      retry: 1, // Limit retries to prevent continuous error loops
      ...config,
    },
  );
};

export const useGetSubscriptionHistoryQuery = (
  config?: UseQueryOptions<t.ISubscriptionHistory>,
): QueryObserverResult<t.ISubscriptionHistory> => {
  return useQuery<t.ISubscriptionHistory>(
    [QueryKeys.subscriptionHistory],
    () => dataService.getSubscriptionHistory(),
    {
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useGetSubscriptionPlansQuery = (
  config?: UseQueryOptions<t.IPlansResponse>,
): QueryObserverResult<t.IPlansResponse> => {
  return useQuery<t.IPlansResponse>(
    [QueryKeys.subscriptionPlans],
    () => dataService.getSubscriptionPlans(),
    {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      ...config,
    },
  );
};

export const useGetSubscriptionUsageQuery = (
  config?: UseQueryOptions<{ usage: t.IUsageStats }>,
): QueryObserverResult<{ usage: t.IUsageStats }> => {
  return useQuery<{ usage: t.IUsageStats }>(
    [QueryKeys.subscriptionUsage],
    () => dataService.getSubscriptionUsage(),
    {
      refetchOnWindowFocus: false, // Disabled to prevent refetch when Paddle overlay opens
      refetchInterval: 60000, // Refresh every minute
      retry: 1, // Limit retries to prevent continuous error loops
      ...config,
    },
  );
};

export const useGetSubscriptionInvoicesQuery = (
  config?: UseQueryOptions<t.IInvoicesResponse>,
): QueryObserverResult<t.IInvoicesResponse> => {
  return useQuery<t.IInvoicesResponse>(
    [QueryKeys.subscriptionInvoices],
    () => dataService.getSubscriptionInvoices(),
    {
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useCreateCheckoutMutation = (): UseMutationResult<
  t.ICheckoutResponse,
  unknown,
  t.ICheckoutRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (data: t.ICheckoutRequest) => dataService.createCheckout(data),
    {
      onSuccess: () => {
        // Don't invalidate queries immediately when Paddle overlay opens
        // This prevents refetch loops. The page will reload after checkout completes
        // which will naturally refresh the data, or the webhook will update it
      },
      onError: (error) => {
        // Log error but don't cause retry loops
        console.error('[Subscription] Checkout error:', error);
      },
    },
  );
};

export const useCancelSubscriptionMutation = (): UseMutationResult<
  { message: string },
  unknown,
  { immediately?: boolean } | undefined
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (data?: { immediately?: boolean }) => dataService.cancelSubscription(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscription]);
        queryClient.invalidateQueries([QueryKeys.subscriptionHistory]);
      },
    },
  );
};

export const useResumeSubscriptionMutation = (): UseMutationResult<
  { message: string },
  unknown,
  void
> => {
  const queryClient = useQueryClient();
  return useMutation(
    () => dataService.resumeSubscription(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscription]);
        queryClient.invalidateQueries([QueryKeys.subscriptionHistory]);
      },
    },
  );
};

export const useChangePlanMutation = (): UseMutationResult<
  { message: string },
  unknown,
  t.IChangePlanRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (data: t.IChangePlanRequest) => dataService.changePlan(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscription]);
        queryClient.invalidateQueries([QueryKeys.subscriptionHistory]);
      },
    },
  );
};
