import React from 'react';
import {
  useGetSubscriptionUsageQuery,
  useGetSubscriptionQuery,
  SubscriptionPlan,
} from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useEdition } from '~/hooks';

export default function QuotaDisplay() {
  const { isEnterprise } = useEdition();

  // Quota display is enterprise-only
  if (!isEnterprise) {
    return null;
  }

  const { data: usageData, isLoading: usageLoading } = useGetSubscriptionUsageQuery();
  const { data: subscriptionData } = useGetSubscriptionQuery();

  const subscription = subscriptionData?.subscription;
  const usage = usageData?.usage;

  // Default to FREE plan if subscription data is not available yet
  const plan = subscription?.plan || SubscriptionPlan.FREE;
  const isFree = plan === SubscriptionPlan.FREE;
  const isImplicit = subscription?.isImplicit ?? true;

  // Show component as soon as usage data is available, even if subscription data is still loading
  if (usageLoading || !usage) {
    return null;
  }

  const limit = usage.limit || 5;
  const queryCount = usage.queryCount || 0;
  const percentage = usage.percentage || 0;
  const label = isFree || isImplicit ? 'Total Queries' : 'Monthly Queries';

  return (
    <TooltipAnchor
      description={`${label}: ${queryCount.toLocaleString()} / ${limit === Infinity ? '∞' : limit.toLocaleString()}`}
    >
      <div className="dark:border-border-dark inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-tertiary px-2.5 py-1 text-xs font-medium text-text-primary sm:gap-2 sm:px-3 sm:py-1.5">
        <span className="hidden whitespace-nowrap text-text-secondary sm:inline">{label}:</span>
        <span className="whitespace-nowrap font-semibold">
          {queryCount.toLocaleString()} <span className="font-normal text-text-tertiary">/</span>{' '}
          {limit === Infinity ? '∞' : limit.toLocaleString()}
        </span>
        <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover sm:w-16">
          <div
            className="h-full bg-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    </TooltipAnchor>
  );
}
