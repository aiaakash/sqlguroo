const express = require('express');
const { logger } = require('~/config');
const paddleService = require('../../services/PaddleService');
const subscriptionService = require('../../services/SubscriptionService');
const { SubscriptionStatus } = require('@librechat/data-schemas');

const router = express.Router();

router.post('/', express.json(), async (req, res) => {
  try {
    const signature = req.headers['paddle-signature'];

    if (!signature) {
      logger.warn('[Paddle Webhook] Missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const isValid = paddleService.verifyWebhookSignature(signature, req.body);
    if (!isValid) {
      logger.warn('[Paddle Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event_type, data } = req.body;
    logger.info(`[Paddle Webhook] Received event: ${event_type}`);

    switch (event_type) {
      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;
      case 'subscription.activated':
        await handleSubscriptionActivated(data);
        break;
      case 'subscription.canceled':
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(data);
        break;
      case 'subscription.paused':
        await handleSubscriptionPaused(data);
        break;
      case 'subscription.resumed':
        await handleSubscriptionResumed(data);
        break;
      case 'subscription.past_due':
        await handleSubscriptionPastDue(data);
        break;
      case 'transaction.completed':
        await handleTransactionCompleted(data);
        break;
      case 'transaction.payment_failed':
        await handlePaymentFailed(data);
        break;
      default:
        logger.info(`[Paddle Webhook] Unhandled event type: ${event_type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('[Paddle Webhook] Error processing webhook:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

async function handleSubscriptionCreated(data) {
  try {
    const { id, customer_id, custom_data, items, status, current_billing_period } = data;
    const userId = custom_data?.userId;
    if (!userId) {
      logger.error('[Paddle Webhook] No userId in custom_data for subscription.created');
      return;
    }

    const priceId = items[0]?.price?.id;
    const plan = determinePlanFromPriceId(priceId);
    const billingCycle = determineBillingCycleFromPriceId(priceId);

    await subscriptionService.createSubscription({
      userId,
      paddleCustomerId: customer_id,
      paddleSubscriptionId: id,
      plan,
      status: mapPaddleStatus(status),
      billingCycle,
      currentPeriodStart: current_billing_period?.starts_at
        ? new Date(current_billing_period.starts_at)
        : new Date(),
      currentPeriodEnd: current_billing_period?.ends_at
        ? new Date(current_billing_period.ends_at)
        : null,
      metadata: data,
    });

    logger.info(`[Paddle Webhook] Created subscription for user ${userId}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.created:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(data) {
  try {
    const { id, items, status, current_billing_period, scheduled_change } = data;
    const priceId = items[0]?.price?.id;
    const plan = determinePlanFromPriceId(priceId);
    const billingCycle = determineBillingCycleFromPriceId(priceId);

    const updates = {
      plan,
      billingCycle,
      status: mapPaddleStatus(status),
      currentPeriodStart: current_billing_period?.starts_at
        ? new Date(current_billing_period.starts_at)
        : undefined,
      currentPeriodEnd: current_billing_period?.ends_at
        ? new Date(current_billing_period.ends_at)
        : undefined,
      cancelAtPeriodEnd: scheduled_change?.action === 'cancel',
      metadata: data,
    };

    await subscriptionService.updateSubscriptionByPaddleId(id, updates);
    logger.info(`[Paddle Webhook] Updated subscription ${id}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.updated:', error);
    throw error;
  }
}

async function handleSubscriptionActivated(data) {
  try {
    const { id } = data;
    await subscriptionService.updateSubscriptionByPaddleId(id, {
      status: SubscriptionStatus.ACTIVE,
    });
    logger.info(`[Paddle Webhook] Activated subscription ${id}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.activated:', error);
    throw error;
  }
}

async function handleSubscriptionCancelled(data) {
  try {
    const { id, canceled_at } = data;
    await subscriptionService.updateSubscriptionByPaddleId(id, {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: canceled_at ? new Date(canceled_at) : new Date(),
    });
    logger.info(`[Paddle Webhook] Cancelled subscription ${id}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.cancelled:', error);
    throw error;
  }
}

async function handleSubscriptionPaused(data) {
  try {
    const { id } = data;
    await subscriptionService.updateSubscriptionByPaddleId(id, {
      status: SubscriptionStatus.PAUSED,
    });
    logger.info(`[Paddle Webhook] Paused subscription ${id}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.paused:', error);
    throw error;
  }
}

async function handleSubscriptionResumed(data) {
  try {
    const { id } = data;
    await subscriptionService.updateSubscriptionByPaddleId(id, {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });
    logger.info(`[Paddle Webhook] Resumed subscription ${id}`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.resumed:', error);
    throw error;
  }
}

async function handleSubscriptionPastDue(data) {
  try {
    const { id } = data;
    await subscriptionService.updateSubscriptionByPaddleId(id, {
      status: SubscriptionStatus.PAST_DUE,
    });
    logger.info(`[Paddle Webhook] Subscription ${id} is past due`);
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling subscription.past_due:', error);
    throw error;
  }
}

async function handleTransactionCompleted(data) {
  try {
    const { subscription_id } = data;
    if (subscription_id) {
      await subscriptionService.updateSubscriptionByPaddleId(subscription_id, {
        status: SubscriptionStatus.ACTIVE,
      });
      logger.info(`[Paddle Webhook] Transaction completed for subscription ${subscription_id}`);
    }
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling transaction.completed:', error);
    throw error;
  }
}

async function handlePaymentFailed(data) {
  try {
    const { subscription_id } = data;
    if (subscription_id) {
      await subscriptionService.updateSubscriptionByPaddleId(subscription_id, {
        status: SubscriptionStatus.PAST_DUE,
      });
      logger.info(`[Paddle Webhook] Payment failed for subscription ${subscription_id}`);
    }
  } catch (error) {
    logger.error('[Paddle Webhook] Error handling transaction.payment_failed:', error);
    throw error;
  }
}

function determinePlanFromPriceId(priceId) {
  const proPrices = [process.env.PADDLE_PRICE_PRO_MONTHLY, process.env.PADDLE_PRICE_PRO_ANNUAL];
  const ultraPrices = [
    process.env.PADDLE_PRICE_ULTRA_MONTHLY,
    process.env.PADDLE_PRICE_ULTRA_ANNUAL,
  ];

  if (proPrices.includes(priceId)) return 'pro';
  if (ultraPrices.includes(priceId)) return 'ultra';
  return 'free';
}

function determineBillingCycleFromPriceId(priceId) {
  const monthlyPrices = [
    process.env.PADDLE_PRICE_PRO_MONTHLY,
    process.env.PADDLE_PRICE_ULTRA_MONTHLY,
  ];
  const annualPrices = [process.env.PADDLE_PRICE_PRO_ANNUAL, process.env.PADDLE_PRICE_ULTRA_ANNUAL];

  if (monthlyPrices.includes(priceId)) return 'monthly';
  if (annualPrices.includes(priceId)) return 'annual';
  return 'none';
}

function mapPaddleStatus(paddleStatus) {
  const statusMap = {
    active: SubscriptionStatus.ACTIVE,
    canceled: SubscriptionStatus.CANCELLED,
    cancelled: SubscriptionStatus.CANCELLED,
    past_due: SubscriptionStatus.PAST_DUE,
    paused: SubscriptionStatus.PAUSED,
    trialing: SubscriptionStatus.TRIALING,
  };
  return statusMap[paddleStatus] || SubscriptionStatus.ACTIVE;
}

module.exports = router;
