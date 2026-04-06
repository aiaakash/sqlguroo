/**
 * Subscription Routes - Edition-aware loader
 *
 * In Enterprise mode: full subscription management with Paddle
 * In Community mode: permissive defaults (no limits)
 */
const { isEnterprise } = require('~/server/config/edition');

const router = isEnterprise
  ? require('../../../enterprise/backend/src/routes/subscription')
  : require('../../../community/backend/src/routes/subscription');

module.exports = router;
