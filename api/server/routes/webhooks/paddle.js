/**
 * Paddle Webhook - Edition-aware loader
 *
 * In Enterprise mode: handles Paddle subscription lifecycle events
 * In Community mode: returns 404 (webhooks are enterprise-only)
 */
const express = require('express');
const { isEnterprise } = require('~/server/config/edition');

let router;

if (isEnterprise) {
  router = require('../../../../enterprise/backend/src/routes/webhooks/paddle');
} else {
  router = express.Router();
  router.all('/{*path}', (req, res) => {
    res.status(404).json({ error: 'Webhooks are not available in community edition' });
  });
}

module.exports = router;
