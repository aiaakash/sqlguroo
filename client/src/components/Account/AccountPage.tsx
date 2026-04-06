import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useGetSubscriptionQuery,
  useGetSubscriptionUsageQuery,
  useCancelSubscriptionMutation,
  useResumeSubscriptionMutation,
  SubscriptionPlan,
  PLAN_NAMES,
} from 'librechat-data-provider';
import { Loader, CreditCard, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button, Input, Label } from '@librechat/client';
import PricingPlans from '../Subscription/PricingPlans';
import { useAuthContext, useEdition } from '~/hooks';

export default function AccountPage() {
  const { user } = useAuthContext();
  const { isEnterprise } = useEdition();
  const { data: subscriptionData, isLoading: subscriptionLoading } = useGetSubscriptionQuery();
  const { data: usageData, isLoading: usageLoading } = useGetSubscriptionUsageQuery();
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const cancelMutation = useCancelSubscriptionMutation();
  const resumeMutation = useResumeSubscriptionMutation();

  const subscription = subscriptionData?.subscription;
  const usage = usageData?.usage;

  if (isEnterprise && (subscriptionLoading || usageLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-primary">
        <Loader className="h-8 w-8 animate-spin text-text-secondary" />
      </div>
    );
  }

  const plan = subscription?.plan || SubscriptionPlan.FREE;
  const planName = PLAN_NAMES[plan] || 'Free';
  const limit = usage?.limit || 5;
  const queryCount = usage?.queryCount || 0;
  const percentage = usage?.percentage || 0;
  const isImplicit = subscription?.isImplicit;
  const status = subscription?.status;
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd;

  const handleCancel = async (immediately: boolean) => {
    try {
      await cancelMutation.mutateAsync({ immediately });
      setShowCancelConfirm(false);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    }
  };

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to resume subscription:', error);
    }
  };

  const isFree = plan === SubscriptionPlan.FREE;
  const canUpgrade = isFree || plan === SubscriptionPlan.PRO;

  /**
   * Section Wrapper Component for consistent card styling
   */
  const Section = ({
    title,
    children,
    rightElement,
  }: {
    title: string;
    children: React.ReactNode;
    rightElement?: React.ReactNode;
  }) => (
    <div className="dark:border-border-dark rounded-xl border border-border-light bg-surface-tertiary p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {rightElement}
      </div>
      {children}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface-primary">
      {/* Top Bar / Header */}
      <div className="bg-surface-primary/80 dark:border-border-dark sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border-light px-4 backdrop-blur-md lg:px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden text-base sm:inline">Back to Chat</span>
          </Link>
          <div className="dark:bg-border-dark h-6 w-px shrink-0 bg-border-light" />
          <h1 className="text-lg font-semibold text-text-primary">Account Settings</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 lg:p-6">
        {/* Profile Information Section */}
        <Section title="Profile Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-text-secondary">
                Email Address
              </Label>
              <Input
                id="email"
                value={user?.email || ''}
                readOnly
                className="bg-surface-primary/50 cursor-not-allowed border-border-light transition-all"
              />
            </div>
            {user?.name && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm text-text-secondary">
                  Full Name
                </Label>
                <Input
                  id="name"
                  value={user.name}
                  readOnly
                  className="bg-surface-primary/50 cursor-not-allowed border-border-light transition-all"
                />
              </div>
            )}
          </div>
        </Section>

        {/* Main Content Grid - Subscription and Usage Side by Side on Large Screens */}
        {isEnterprise && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Subscription Section */}
            <Section
              title="Subscription Plan"
              rightElement={
                canUpgrade && (
                  <Button
                    size="sm"
                    onClick={() => setShowPricingModal(true)}
                    className="bg-blue-600 font-semibold text-white hover:bg-blue-700"
                  >
                    Upgrade Plan
                  </Button>
                )
              }
            >
              <div className="flex flex-col gap-4">
                <div className="dark:border-border-dark flex items-start gap-3 rounded-lg border border-border-light bg-surface-primary p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold text-text-primary">{planName}</p>
                      {!isFree && status === 'active' && !cancelAtPeriodEnd && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Active
                        </span>
                      )}
                      {!isFree && status === 'active' && cancelAtPeriodEnd && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Cancelling soon
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                      {isImplicit
                        ? 'Free tier - no active subscription'
                        : `Your current plan status is ${status}.`}
                    </p>
                  </div>
                </div>

                {!isImplicit && (
                  <div className="dark:border-border-dark grid grid-cols-1 gap-2.5 border-t border-border-light pt-3 sm:grid-cols-2">
                    {subscription?.billingCycle && subscription.billingCycle !== 'none' && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">Billing Cycle</span>
                        <span className="text-sm font-semibold capitalize text-text-primary">
                          {subscription.billingCycle}
                        </span>
                      </div>
                    )}
                    {subscription?.currentPeriodStart && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">Period Started</span>
                        <span className="text-sm font-semibold text-text-primary">
                          {new Date(subscription.currentPeriodStart).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    )}
                    {subscription?.currentPeriodEnd && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">
                          {cancelAtPeriodEnd ? 'Cancelling On' : 'Renewal Date'}
                        </span>
                        <span className="text-sm font-semibold text-text-primary">
                          {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    )}
                    {subscription?.cancelledAt && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">Cancellation Date</span>
                        <span className="text-sm font-semibold text-text-primary">
                          {new Date(subscription.cancelledAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    )}
                    {subscription?.paddleSubscriptionId && (
                      <div className="flex flex-col gap-0.5 sm:col-span-2">
                        <span className="text-xs text-text-tertiary">Subscription ID</span>
                        <span className="break-all font-mono text-xs text-text-tertiary">
                          {subscription.paddleSubscriptionId}
                        </span>
                      </div>
                    )}
                    {subscription?.createdAt && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">Created</span>
                        <span className="text-sm text-text-secondary">
                          {new Date(subscription.createdAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    )}
                    {subscription?.updatedAt && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-tertiary">Last Updated</span>
                        <span className="text-sm text-text-secondary">
                          {new Date(subscription.updatedAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {!isFree && !isImplicit && (
                  <div className="space-y-2 pt-1">
                    {cancelAtPeriodEnd ? (
                      <>
                        <Button
                          disabled={true}
                          variant="outline"
                          className="w-full cursor-not-allowed border-gray-300 bg-gray-50/50 text-gray-500 opacity-75 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400 sm:w-auto"
                        >
                          Resume Subscription
                        </Button>
                        <p className="text-xs text-text-tertiary">
                          Resuming subscriptions after cancellation is currently unavailable.
                        </p>
                      </>
                    ) : (
                      <Button
                        onClick={() => setShowCancelConfirm(true)}
                        variant="outline"
                        className="w-full border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20 sm:w-auto"
                      >
                        Cancel Subscription
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* Usage Analytics Section */}
            <Section title="Usage Metrics">
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-secondary">
                      {isFree || isImplicit ? 'Total Queries' : 'Monthly Queries'}
                    </span>
                    <span className="text-sm font-bold text-text-primary">
                      {queryCount.toLocaleString()}{' '}
                      <span className="font-normal text-text-tertiary">/</span>{' '}
                      {limit === Infinity ? '∞' : limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-hover shadow-inner">
                    <div
                      className="h-full bg-blue-600 shadow-sm transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  {usage?.periodEnd && !isFree && !isImplicit && (
                    <p className="text-xs text-text-tertiary">
                      Usage resets on{' '}
                      {new Date(usage.periodEnd).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })}
                    </p>
                  )}
                </div>

                {queryCount >= limit * 0.9 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-yellow-100 bg-yellow-50/50 p-3 dark:border-yellow-900/30 dark:bg-yellow-900/10">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-yellow-800 dark:text-yellow-400">
                        Nearing usage limit
                      </p>
                      <p className="text-sm leading-relaxed text-yellow-700/80 dark:text-yellow-500/80">
                        {canUpgrade
                          ? 'Consider upgrading to a higher plan to unlock more monthly queries.'
                          : 'Your query limit will be replenished at the beginning of the next cycle.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

        {/* Support Note Section */}
        <div className="dark:border-border-dark mx-auto w-full rounded-xl border border-border-light bg-surface-tertiary p-4 shadow-sm">
          <p className="text-center text-sm text-text-secondary">
            For any queries or assistance, drop a mail at{' '}
            <a
              href="mailto:sqlguroo@gmail.com"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              sqlguroo@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="bg-surface-primary/60 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="scale-in-center dark:border-border-dark w-full max-w-md overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-0 shadow-2xl duration-200 animate-in fade-in zoom-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-text-primary">Cancel Subscription?</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                You will lose your premium benefits once your current billing period ends on{' '}
                <span className="font-bold text-text-primary">
                  {subscription?.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })
                    : 'the end of your billing cycle'}
                </span>
                . You can reactivate your plan anytime before this date.
              </p>
            </div>
            <div className="bg-surface-secondary/50 dark:border-border-dark flex justify-end gap-3 border-t border-border-light p-4">
              <Button
                variant="outline"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelMutation.isLoading}
              >
                Keep My Plan
              </Button>
              <Button
                onClick={() => handleCancel(false)}
                disabled={cancelMutation.isLoading}
                className="bg-red-600 text-white shadow-sm hover:bg-red-700"
              >
                {cancelMutation.isLoading ? 'Processing...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Modal Component */}
      {showPricingModal && (
        <PricingPlans
          open={showPricingModal}
          onOpenChange={setShowPricingModal}
          currentPlan={plan}
        />
      )}
    </div>
  );
}
