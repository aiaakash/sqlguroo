import React, { useState, useEffect } from 'react';
import {
  useGetSubscriptionPlansQuery,
  useCreateCheckoutMutation,
} from 'librechat-data-provider';

// Plan constants - using string literals to avoid import issues
const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';
const PLAN_ULTRA = 'ultra';

type PlanType = typeof PLAN_FREE | typeof PLAN_PRO | typeof PLAN_ULTRA;
import { X, Check, Loader, CreditCard } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { Button } from '@librechat/client';
import usePaddle from '~/hooks/usePaddle';

interface PricingPlansProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan?: string;
}

export default function PricingPlans({ open, onOpenChange, currentPlan }: PricingPlansProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const { data: plansData, isLoading } = useGetSubscriptionPlansQuery();
  const createCheckout = useCreateCheckoutMutation();
  const { isReady, Paddle } = usePaddle();

  const plans = plansData?.plans || [];

  useEffect(() => {
    if (!open && Paddle) {
      // Close any open Paddle overlays when modal closes
      try {
        Paddle.Overlay.close();
      } catch (error) {
        // Ignore errors if overlay is not open
      }
    }
  }, [open, Paddle]);

  const handleSelectPlan = async (plan: PlanType | string) => {
    if (plan === PLAN_FREE || plan === 'free') {
      return;
    }

    try {
      const checkoutResponse = await createCheckout.mutateAsync({
        plan,
        billingCycle,
      });

      // Paddle.js integration - per official docs: https://developer.paddle.com/build/tools/sandbox
      // The checkout response from Paddle API v2 contains transaction data
      // We need to extract the transaction ID to open checkout
      if (isReady && Paddle && checkoutResponse) {
        // Paddle API v2 response structure: { data: { id, checkout, ... }, checkout: { id, url } }
        const response = checkoutResponse as any;
        const transactionId = response.data?.id || checkoutResponse.checkout?.id;

        if (transactionId) {
          try {
            // Close the pricing modal before opening Paddle checkout
            // This prevents the pricing modal from shadowing the Paddle overlay
            onOpenChange(false);

            // Small delay to ensure modal closes before Paddle opens
            setTimeout(() => {
              // Open Paddle checkout overlay
              Paddle.Checkout.open({
                transactionId: transactionId,
                settings: {
                  displayMode: 'overlay',
                  theme: 'light',
                  locale: 'en',
                },
                eventCallback: (data: any) => {
                  console.log('[Paddle] Checkout event:', data);
                  if (data.name === 'checkout.completed') {
                    // Refresh subscription data after successful payment
                    // Use a longer delay to ensure webhook has processed
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  }
                },
              });
            }, 100);
          } catch (error) {
            console.error('[Paddle] Failed to open checkout:', error);
            alert('Failed to open checkout. Please try again or contact support.');
          }
        } else {
          console.error('[Paddle] No transaction ID in checkout response:', checkoutResponse);
          alert('Failed to create checkout. Please try again or contact support.');
        }
      } else {
        console.error('[Paddle] Cannot open checkout:', {
          isReady,
          hasPaddle: !!Paddle,
          checkoutResponse,
        });
        if (!isReady) {
          alert('Paddle is not ready. Please wait a moment and try again.');
        }
      }
    } catch (error) {
      console.error('Failed to create checkout:', error);
    }
  };

  const getPrice = (plan: any) => {
    if (plan.id === PLAN_FREE || plan.id === 'free') {
      return { price: 0, savings: null };
    }

    if (plan.prices) {
      const price = plan.prices[billingCycle];
      const monthlyPrice = plan.prices.monthly;
      const annualPrice = plan.prices.annual;

      if (billingCycle === 'annual') {
        const annualTotal = annualPrice;
        const monthlyTotal = monthlyPrice * 12;
        const savings = Math.round(((monthlyTotal - annualTotal) / monthlyTotal) * 100);
        return { price: annualPrice, savings };
      }

      return { price: monthlyPrice, savings: null };
    }

    return { price: plan.price || 0, savings: null };
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-w-6xl bg-card" showCloseButton={false}>
        <OGDialogHeader className="pr-10">
          <OGDialogTitle>Choose Your Plan</OGDialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-text-secondary hover:bg-surface-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </OGDialogHeader>

        <div className="flex flex-col gap-6 p-6">
          {/* Billing Cycle Toggle */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'monthly'
                ? 'bg-blue-600 text-white'
                : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
                }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'annual'
                ? 'bg-blue-600 text-white'
                : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
                }`}
            >
              Annual
              <span className="ml-2 rounded-full bg-green-500 px-2 py-0.5 text-xs text-white">
                Save 17%
              </span>
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((plan: any) => {
                const { price, savings } = getPrice(plan);
                const isCurrentPlan = currentPlan === plan.id;
                const isFree = plan.id === PLAN_FREE || plan.id === 'free';
                const isPro = plan.id === PLAN_PRO || plan.id === 'pro';
                const isUltra = plan.id === PLAN_ULTRA || plan.id === 'ultra';

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-xl border p-6 transition-all ${isPro
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                      : isUltra
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-900/10 shadow-lg shadow-purple-500/20'
                        : isFree
                          ? 'border-blue-300 bg-blue-50/30 dark:border-blue-700 dark:bg-blue-900/5'
                          : 'border-border-light bg-surface-tertiary dark:border-border-dark'
                      }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                        Most Popular
                      </div>
                    )}
                    {isUltra && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1 text-xs font-medium text-white shadow-md">
                        Premium
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-xl font-semibold text-text-primary">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-text-primary">
                          ${price}
                        </span>
                        {!isFree && (
                          <span className="text-text-secondary">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                        )}
                      </div>
                      {savings && (
                        <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                          Save {savings}% with annual billing
                        </p>
                      )}
                    </div>

                    <div className="mb-6 flex-1">
                      <ul className="space-y-2">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-text-secondary">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Button
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={isCurrentPlan || createCheckout.isLoading}
                      className={`w-full ${isPro
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : isUltra
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-md'
                          : isFree
                            ? 'bg-blue-400 hover:bg-blue-500 text-white dark:bg-blue-600 dark:hover:bg-blue-700'
                            : 'bg-surface-hover hover:bg-surface-active-alt'
                        }`}
                    >
                      {createCheckout.isLoading ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : isFree ? (
                        'Current Plan'
                      ) : (
                        'Select Plan'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

// Type definitions for plan info
interface IPlanInfo {
  id: string;
  name: string;
  price?: number;
  prices?: {
    monthly: number;
    annual: number;
  };
  queryLimit: number | string;
  features: string[];
}

