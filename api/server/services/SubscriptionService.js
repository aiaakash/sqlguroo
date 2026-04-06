/**
 * SubscriptionService - Edition-aware loader
 *
 * In Enterprise mode: delegates to enterprise/backend/src/services/SubscriptionService
 * In Community mode: delegates to community/backend/src/services/SubscriptionService (permissive)
 */
const { isEnterprise } = require('~/server/config/edition');

const service = isEnterprise
  ? require('../../../enterprise/backend/src/services/SubscriptionService')
  : require('../../../community/backend/src/services/SubscriptionService');

module.exports = service;
