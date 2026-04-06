import React, { useState } from 'react';
import { Crown } from 'lucide-react';
import { useGetSubscriptionQuery } from 'librechat-data-provider';
import { SubscriptionPlan } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize, useEdition } from '~/hooks';
import PricingPlans from '../Subscription/PricingPlans';

export default function UpgradeReminder() {
  const { isEnterprise } = useEdition();

  // Upgrade reminder is enterprise-only
  if (!isEnterprise) {
    return null;
  }

  const { data: subscriptionData } = useGetSubscriptionQuery();
  const localize = useLocalize();
  const [showPricingModal, setShowPricingModal] = useState(false);

  const subscription = subscriptionData?.subscription;
  const plan = subscription?.plan || SubscriptionPlan.FREE;
  const isFree = plan === SubscriptionPlan.FREE;

  // Don't show if not free plan
  if (!isFree) {
    return null;
  }

  return (
    <>
      <TooltipAnchor description="Upgrade to Pro or Ultra for more queries and advanced features">
        <button
          onClick={() => setShowPricingModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-gradient-to-r from-green-50/90 to-emerald-50/90 px-4 py-2 text-sm font-medium text-text-primary transition-all hover:from-green-100 hover:to-emerald-100 dark:border-green-700 dark:from-green-900/30 dark:to-emerald-900/30 dark:hover:from-green-900/40 dark:hover:to-emerald-900/40"
          aria-label="Upgrade now to continue using SQL Guroo"
        >
          <Crown className="h-4 w-4 flex-shrink-0 text-amber-500" />
          <span className="whitespace-nowrap">Upgrade now to continue using SQL Guroo</span>
        </button>
      </TooltipAnchor>
      <PricingPlans open={showPricingModal} onOpenChange={setShowPricingModal} currentPlan={plan} />
    </>
  );
}
