const { Subscription, Usage } = require('~/db/models');
const { logger } = require('~/config');
const { SubscriptionPlan, SubscriptionStatus, PLAN_LIMITS } = require('@librechat/data-schemas');

function startOfMonth(date) {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfMonth(date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

class SubscriptionService {
  async getCurrentSubscription(userId) {
    try {
      const subscription = await Subscription.findOne({
        userId,
        status: {
          $in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      }).sort({ createdAt: -1 });

      if (!subscription) {
        return {
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: 'none',
          isImplicit: true,
        };
      }

      return subscription.toObject();
    } catch (error) {
      logger.error('[SubscriptionService] Get current subscription error:', error);
      throw error;
    }
  }

  async getSubscriptionHistory(userId) {
    try {
      return await Subscription.find({ userId }).sort({ createdAt: -1 });
    } catch (error) {
      logger.error('[SubscriptionService] Get subscription history error:', error);
      throw error;
    }
  }

  async createSubscription(subscriptionData) {
    try {
      const subscription = new Subscription(subscriptionData);
      await subscription.save();
      return subscription;
    } catch (error) {
      logger.error('[SubscriptionService] Create subscription error:', error);
      throw error;
    }
  }

  async updateSubscription(subscriptionId, updates) {
    try {
      const subscription = await Subscription.findByIdAndUpdate(
        subscriptionId,
        { $set: updates },
        { new: true },
      );
      return subscription;
    } catch (error) {
      logger.error('[SubscriptionService] Update subscription error:', error);
      throw error;
    }
  }

  async updateSubscriptionByPaddleId(paddleSubscriptionId, updates) {
    try {
      const subscription = await Subscription.findOneAndUpdate(
        { paddleSubscriptionId },
        { $set: updates },
        { new: true },
      );
      return subscription;
    } catch (error) {
      logger.error('[SubscriptionService] Update subscription by Paddle ID error:', error);
      throw error;
    }
  }

  async findByPaddleSubscriptionId(paddleSubscriptionId) {
    try {
      return await Subscription.findOne({ paddleSubscriptionId });
    } catch (error) {
      logger.error('[SubscriptionService] Find by Paddle subscription ID error:', error);
      throw error;
    }
  }

  async cancelAtPeriodEnd(userId) {
    try {
      const subscription = await Subscription.findOne({
        userId,
        status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      subscription.cancelAtPeriodEnd = true;
      await subscription.save();
      return subscription;
    } catch (error) {
      logger.error('[SubscriptionService] Cancel at period end error:', error);
      throw error;
    }
  }

  async resumeSubscription(userId) {
    try {
      const subscription = await Subscription.findOne({
        userId,
        status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        cancelAtPeriodEnd: true,
      });

      if (!subscription) {
        throw new Error('No subscription to resume');
      }

      subscription.cancelAtPeriodEnd = false;
      await subscription.save();
      return subscription;
    } catch (error) {
      logger.error('[SubscriptionService] Resume subscription error:', error);
      throw error;
    }
  }

  getQueryLimit(plan) {
    const limits = this.getPlanDetails(plan);
    return limits ? limits.queryLimit : 5;
  }

  async getOrCreateCurrentUsage(userId) {
    try {
      const now = new Date();
      let periodStart, periodEnd;

      const subscription = await this.getCurrentSubscription(userId);

      if (subscription.plan === SubscriptionPlan.FREE || subscription.isImplicit) {
        periodStart = new Date('2000-01-01T00:00:00.000Z');
        periodEnd = new Date('2099-12-31T23:59:59.999Z');
      } else {
        periodStart = startOfMonth(now);
        periodEnd = endOfMonth(now);
      }

      let usage = await Usage.findOne({
        userId,
        periodStart: { $lte: now },
        periodEnd: { $gte: now },
      });

      if (!usage && (subscription.plan === SubscriptionPlan.FREE || subscription.isImplicit)) {
        usage = await Usage.findOne({
          userId,
          periodEnd: { $gt: new Date('2099-01-01') },
        });
      }

      if (!usage) {
        usage = new Usage({
          userId,
          periodStart,
          periodEnd,
          queryCount: 0,
        });
        await usage.save();
      } else if (
        (subscription.plan === SubscriptionPlan.FREE || subscription.isImplicit) &&
        usage.periodEnd < new Date('2099-01-01')
      ) {
        usage.periodStart = periodStart;
        usage.periodEnd = periodEnd;
        await usage.save();
      }

      return usage;
    } catch (error) {
      logger.error('[SubscriptionService] Get or create usage error:', error);
      throw error;
    }
  }

  async incrementQueryCount(userId) {
    try {
      const usage = await this.getOrCreateCurrentUsage(userId);
      usage.queryCount += 1;
      usage.lastQueryAt = new Date();
      await usage.save();
      return usage;
    } catch (error) {
      logger.error('[SubscriptionService] Increment query count error:', error);
      throw error;
    }
  }

  async checkQueryLimit(userId) {
    try {
      const subscription = await this.getCurrentSubscription(userId);
      const usage = await this.getOrCreateCurrentUsage(userId);
      const limit = this.getQueryLimit(subscription.plan);

      return {
        exceeded: usage.queryCount >= limit,
        usage: usage.toObject ? usage.toObject() : usage,
        limit,
        plan: subscription.plan,
      };
    } catch (error) {
      logger.error('[SubscriptionService] Check query limit error:', error);
      throw error;
    }
  }

  async getUsageStats(userId) {
    try {
      const subscription = await this.getCurrentSubscription(userId);
      const usage = await this.getOrCreateCurrentUsage(userId);
      const limit = this.getQueryLimit(subscription.plan);

      return {
        queryCount: usage.queryCount,
        limit,
        percentage: limit === Infinity ? 0 : (usage.queryCount / limit) * 100,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        lastQueryAt: usage.lastQueryAt,
      };
    } catch (error) {
      logger.error('[SubscriptionService] Get usage stats error:', error);
      throw error;
    }
  }

  getPlanDetails(plan) {
    const limits = {
      [SubscriptionPlan.FREE]: {
        queryLimit: 5,
        features: [
          'GPT-5-mini model available',
          '5 test queries all time',
          'Advanced visualizations',
        ],
      },
      [SubscriptionPlan.PRO]: {
        queryLimit: 200,
        features: [
          'Best models available - GPT-5.2, Claude Sonnet 4.5 and Opus 4.5',
          '200 queries/month',
          'Advanced visualizations',
          'Email support',
          '5 database connections max',
        ],
      },
      [SubscriptionPlan.ULTRA]: {
        queryLimit: 650,
        features: [
          'Best models available - GPT-5.2, Claude Sonnet 4.5 and Opus 4.5',
          '650 queries/month',
          'Advanced visualizations',
          'Priority email support',
          'Unlimited database connections',
        ],
      },
    };

    return limits[plan] || limits[SubscriptionPlan.FREE];
  }
}

module.exports = new SubscriptionService();
