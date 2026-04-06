/**
 * PaddleService - Edition-aware loader
 *
 * In Enterprise mode: delegates to enterprise/backend/src/services/PaddleService
 * In Community mode: not available (Paddle integration is enterprise-only)
 */
const { isEnterprise } = require('~/server/config/edition');

if (!isEnterprise) {
  module.exports = {
    createCheckout: () => {
      throw new Error('Paddle is not available in community edition');
    },
    getSubscription: () => {
      throw new Error('Paddle is not available in community edition');
    },
    cancelSubscription: () => {
      throw new Error('Paddle is not available in community edition');
    },
    resumeSubscription: () => {
      throw new Error('Paddle is not available in community edition');
    },
    updateSubscription: () => {
      throw new Error('Paddle is not available in community edition');
    },
    getCustomer: () => {
      throw new Error('Paddle is not available in community edition');
    },
    getCustomerTransactions: () => {
      throw new Error('Paddle is not available in community edition');
    },
    verifyWebhookSignature: () => false,
    getPriceId: () => {
      throw new Error('Paddle is not available in community edition');
    },
  };
} else {
  module.exports = require('../../../enterprise/backend/src/services/PaddleService');
}
