const express = require('express');
const { logger } = require('~/config');

/**
 * Community Edition - Subscription Routes
 *
 * Returns permissive defaults. No payment integration.
 * Community users have unlimited access.
 */
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    subscription: {
      plan: 'free',
      status: 'active',
      billingCycle: 'none',
      isImplicit: true,
    },
    usage: {
      queryCount: 0,
      limit: Infinity,
      percentage: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
    },
  });
});

router.get('/history', (req, res) => {
  res.json({ history: [] });
});

router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Community',
        price: 0,
        queryLimit: Infinity,
        features: ['All AI models available', 'Unlimited queries', 'Advanced visualizations'],
      },
    ],
  });
});

router.get('/usage', (req, res) => {
  res.json({
    usage: {
      queryCount: 0,
      limit: Infinity,
      percentage: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
    },
  });
});

router.get('/invoices', (req, res) => {
  res.json({ invoices: [] });
});

// No-op endpoints for community edition
router.post('/checkout', (req, res) => {
  res.status(400).json({ error: 'Subscriptions are not available in community edition' });
});

router.post('/cancel', (req, res) => {
  res.status(400).json({ error: 'Subscriptions are not available in community edition' });
});

router.post('/resume', (req, res) => {
  res.status(400).json({ error: 'Subscriptions are not available in community edition' });
});

router.post('/change-plan', (req, res) => {
  res.status(400).json({ error: 'Subscriptions are not available in community edition' });
});

module.exports = router;
