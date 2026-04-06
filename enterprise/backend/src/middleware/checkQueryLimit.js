const subscriptionService = require('../services/SubscriptionService');
const { logger } = require('~/config');

const checkQueryLimit = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[checkQueryLimit] middleware: No userId found in req.user');
      return next();
    }
    const { exceeded, usage, limit, plan } = await subscriptionService.checkQueryLimit(userId);

    if (exceeded) {
      return res.status(429).json({
        message: `Query limit exceeded for ${plan} plan. Limit: ${limit}. Current usage: ${usage.queryCount}.`,
        exceeded: true,
        usage,
        limit,
        plan,
      });
    }

    req.queryLimit = { exceeded, usage, limit, plan };
    next();
  } catch (error) {
    logger.error('[checkQueryLimit] middleware error:', error);
    next(error);
  }
};

const enforceQueryLimit = async (req, res, next) => {
  return checkQueryLimit(req, res, next);
};

const incrementQueryCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await subscriptionService.incrementQueryCount(userId);
    next();
  } catch (error) {
    logger.error('[incrementQueryCount] middleware error:', error);
    next(error);
  }
};

module.exports = {
  checkQueryLimit,
  enforceQueryLimit,
  incrementQueryCount,
};
