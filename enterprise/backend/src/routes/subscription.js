const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { logger } = require('~/config');
const paddleService = require('../services/PaddleService');
const subscriptionService = require('../services/SubscriptionService');
const { SubscriptionPlan, PLAN_PRICES, PLAN_NAMES } = require('@librechat/data-schemas');

const router = express.Router();

router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await subscriptionService.getCurrentSubscription(userId);
    const usage = await subscriptionService.getUsageStats(userId);

    res.json({
      subscription,
      usage,
    });
  } catch (error) {
    logger.error('[Subscription] Get subscription error:', error);
    res.json({
      subscription: {
        plan: 'free',
        status: 'active',
        billingCycle: 'none',
        isImplicit: true,
      },
      usage: {
        queryCount: 0,
        limit: 50,
        percentage: 0,
        periodStart: new Date(),
        periodEnd: new Date(),
      },
    });
  }
});

router.get('/history', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await subscriptionService.getSubscriptionHistory(userId);
    res.json({ history });
  } catch (error) {
    logger.error('[Subscription] Get history error:', error);
    res.status(500).json({ error: 'Failed to get subscription history' });
  }
});

router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: SubscriptionPlan.FREE,
        name: PLAN_NAMES[SubscriptionPlan.FREE],
        price: 0,
        queryLimit: 5,
        features: [
          'GPT-5-mini model available',
          '5 test queries all time',
          'Advanced visualizations',
        ],
      },
      {
        id: SubscriptionPlan.PRO,
        name: PLAN_NAMES[SubscriptionPlan.PRO],
        prices: PLAN_PRICES[SubscriptionPlan.PRO],
        queryLimit: 200,
        features: [
          'Best models available - GPT-5.2, Claude Sonnet 4.5 and Opus 4.5',
          '200 queries/month',
          'Advanced visualizations',
          'Email support',
          '5 database connections max',
        ],
      },
      {
        id: SubscriptionPlan.ULTRA,
        name: PLAN_NAMES[SubscriptionPlan.ULTRA],
        prices: PLAN_PRICES[SubscriptionPlan.ULTRA],
        queryLimit: 650,
        features: [
          'Best models available - GPT-5.2, Claude Sonnet 4.5 and Opus 4.5',
          '650 queries/month',
          'Advanced visualizations',
          'Priority email support',
          'Unlimited database connections',
        ],
      },
    ];

    res.json({ plans });
  } catch (error) {
    logger.error('[Subscription] Get plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

router.post('/checkout', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan, billingCycle } = req.body;

    if (!plan || !billingCycle) {
      return res.status(400).json({ error: 'Plan and billing cycle are required' });
    }

    if (![SubscriptionPlan.PRO, SubscriptionPlan.ULTRA].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json({ error: 'Invalid billing cycle' });
    }

    const priceId = paddleService.getPriceId(plan, billingCycle);
    const currentSubscription = await subscriptionService.getCurrentSubscription(userId);
    let paddleCustomerId;

    if (currentSubscription && !currentSubscription.isImplicit) {
      paddleCustomerId = currentSubscription.paddleCustomerId;
    }

    const checkoutResponse = await paddleService.createCheckout({
      priceId,
      customerId: paddleCustomerId,
      customerEmail: req.user.email,
      customData: {
        userId: userId,
        plan,
        billingCycle,
      },
    });

    res.json(checkoutResponse);
  } catch (error) {
    logger.error('[Subscription] Create checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout' });
  }
});

router.post('/cancel', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { immediately } = req.body;

    const currentSubscription = await subscriptionService.getCurrentSubscription(userId);

    if (!currentSubscription || currentSubscription.isImplicit) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    if (currentSubscription.paddleSubscriptionId) {
      await paddleService.cancelSubscription(
        currentSubscription.paddleSubscriptionId,
        immediately === true,
      );
    }

    await subscriptionService.cancelAtPeriodEnd(userId);
    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    logger.error('[Subscription] Cancel error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

router.post('/resume', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSubscription = await subscriptionService.getCurrentSubscription(userId);

    if (!currentSubscription || currentSubscription.isImplicit) {
      return res.status(400).json({ error: 'No subscription to resume' });
    }

    if (!currentSubscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Subscription is not set to cancel' });
    }

    if (currentSubscription.paddleSubscriptionId) {
      await paddleService.resumeSubscription(currentSubscription.paddleSubscriptionId);
    }

    await subscriptionService.resumeSubscription(userId);
    res.json({ message: 'Subscription resumed successfully' });
  } catch (error) {
    logger.error('[Subscription] Resume error:', error);
    res.status(500).json({ error: error.message || 'Failed to resume subscription' });
  }
});

router.post('/change-plan', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { newPlan, newBillingCycle } = req.body;

    if (!newPlan || !newBillingCycle) {
      return res.status(400).json({ error: 'New plan and billing cycle are required' });
    }

    if (![SubscriptionPlan.PRO, SubscriptionPlan.ULTRA].includes(newPlan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    if (!['monthly', 'annual'].includes(newBillingCycle)) {
      return res.status(400).json({ error: 'Invalid billing cycle' });
    }

    const currentSubscription = await subscriptionService.getCurrentSubscription(userId);

    if (!currentSubscription || currentSubscription.isImplicit) {
      return res
        .status(400)
        .json({ error: 'No active subscription. Please create a new subscription.' });
    }

    const newPriceId = paddleService.getPriceId(newPlan, newBillingCycle);

    if (currentSubscription.paddleSubscriptionId) {
      await paddleService.updateSubscription(
        currentSubscription.paddleSubscriptionId,
        newPriceId,
        'prorated_immediately',
      );
    }

    res.json({ message: 'Plan change initiated successfully' });
  } catch (error) {
    logger.error('[Subscription] Change plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to change plan' });
  }
});

router.get('/usage', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await subscriptionService.getUsageStats(userId);
    res.json({ usage });
  } catch (error) {
    logger.error('[Subscription] Get usage error:', error);
    res.json({
      usage: {
        queryCount: 0,
        limit: 50,
        percentage: 0,
        periodStart: new Date(),
        periodEnd: new Date(),
      },
    });
  }
});

router.get('/invoices', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSubscription = await subscriptionService.getCurrentSubscription(userId);

    if (
      !currentSubscription ||
      currentSubscription.isImplicit ||
      !currentSubscription.paddleCustomerId
    ) {
      return res.json({ invoices: [] });
    }

    const transactions = await paddleService.getCustomerTransactions(
      currentSubscription.paddleCustomerId,
    );

    res.json({ invoices: transactions });
  } catch (error) {
    logger.error('[Subscription] Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

module.exports = router;
