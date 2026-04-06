const { logger } = require('~/config');
const { SubscriptionPlan } = require('@librechat/data-schemas');

/**
 * Community Edition SubscriptionService
 *
 * Provides permissive defaults - no query limits, no subscription management.
 * All users get unlimited access to all features.
 */
class CommunitySubscriptionService {
  async getCurrentSubscription(_userId) {
    return {
      plan: SubscriptionPlan.FREE,
      status: 'active',
      billingCycle: 'none',
      isImplicit: true,
    };
  }

  async getSubscriptionHistory(_userId) {
    return [];
  }

  async createSubscription(subscriptionData) {
    logger.debug(
      '[CommunitySubscriptionService] createSubscription called (no-op in community edition)',
    );
    return subscriptionData;
  }

  async updateSubscription(_subscriptionId, updates) {
    logger.debug(
      '[CommunitySubscriptionService] updateSubscription called (no-op in community edition)',
    );
    return updates;
  }

  async updateSubscriptionByPaddleId(_paddleSubscriptionId, updates) {
    logger.debug(
      '[CommunitySubscriptionService] updateSubscriptionByPaddleId called (no-op in community edition)',
    );
    return updates;
  }

  async findByPaddleSubscriptionId(_paddleSubscriptionId) {
    return null;
  }

  async cancelAtPeriodEnd(_userId) {
    logger.debug(
      '[CommunitySubscriptionService] cancelAtPeriodEnd called (no-op in community edition)',
    );
    return null;
  }

  async resumeSubscription(_userId) {
    logger.debug(
      '[CommunitySubscriptionService] resumeSubscription called (no-op in community edition)',
    );
    return null;
  }

  getQueryLimit(_plan) {
    return Infinity;
  }

  async getOrCreateCurrentUsage(_userId) {
    return {
      queryCount: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
    };
  }

  async incrementQueryCount(_userId) {
    return { queryCount: 0 };
  }

  async checkQueryLimit(_userId) {
    return {
      exceeded: false,
      usage: { queryCount: 0 },
      limit: Infinity,
      plan: SubscriptionPlan.FREE,
    };
  }

  async getUsageStats(_userId) {
    return {
      queryCount: 0,
      limit: Infinity,
      percentage: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
      lastQueryAt: null,
    };
  }

  getPlanDetails(_plan) {
    return {
      queryLimit: Infinity,
      features: ['All AI models available', 'Unlimited queries', 'Advanced visualizations'],
    };
  }
}

module.exports = new CommunitySubscriptionService();
