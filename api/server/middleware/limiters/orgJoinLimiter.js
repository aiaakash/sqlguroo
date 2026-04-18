const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { removePorts } = require('~/server/utils');
const { logViolation } = require('~/cache');

const { ORG_JOIN_WINDOW = 15, ORG_JOIN_MAX = 5, ORG_JOIN_VIOLATION_SCORE: score } = process.env;
const windowMs = ORG_JOIN_WINDOW * 60 * 1000;
const max = ORG_JOIN_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many join attempts, please try again after ${windowInMinutes} minutes`;

const handler = async (req, res) => {
  const type = ViolationTypes.ORG_JOIN;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('org_join_limiter'),
};

const orgJoinLimiter = rateLimit(limiterOptions);

module.exports = orgJoinLimiter;
