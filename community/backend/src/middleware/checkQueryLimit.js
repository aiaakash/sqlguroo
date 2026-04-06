const { logger } = require('~/config');

/**
 * Community Edition - Pass-through query limit middleware
 *
 * In community mode, there are no query limits.
 * All middleware functions simply pass through to the next handler.
 */
const checkQueryLimit = async (req, _res, next) => {
  req.queryLimit = { exceeded: false, usage: { queryCount: 0 }, limit: Infinity, plan: 'free' };
  next();
};

const enforceQueryLimit = async (req, res, next) => {
  return checkQueryLimit(req, res, next);
};

const incrementQueryCount = async (_req, _res, next) => {
  next();
};

module.exports = {
  checkQueryLimit,
  enforceQueryLimit,
  incrementQueryCount,
};
