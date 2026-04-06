import { useGetStartupConfig } from '~/data-provider';

/**
 * Hook to check the current edition (enterprise vs community)
 *
 * Enterprise edition includes subscription management, query limits, and Paddle payments.
 * Community edition has no limits, no subscriptions, all features available.
 */
export default function useEdition() {
  const { data: startupConfig } = useGetStartupConfig();

  return {
    edition: startupConfig?.edition || 'community',
    isEnterprise: startupConfig?.isEnterprise ?? false,
    isCommunity: !(startupConfig?.isEnterprise ?? false),
  };
}
