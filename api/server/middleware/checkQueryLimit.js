/**
 * checkQueryLimit - Edition-aware loader
 *
 * In Enterprise mode: enforces per-plan query quotas
 * In Community mode: pass-through (no limits)
 */
const { isEnterprise } = require('~/server/config/edition');

const middleware = isEnterprise
  ? require('../../../enterprise/backend/src/middleware/checkQueryLimit')
  : require('../../../community/backend/src/middleware/checkQueryLimit');

module.exports = middleware;
