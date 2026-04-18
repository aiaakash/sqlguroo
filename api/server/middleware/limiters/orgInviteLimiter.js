const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { removePorts } = require('~/server/utils');
const { logViolation } = require('~/cache');

const { ORG_INVITE_WINDOW = 60, ORG_INVITE_MAX = 10, ORG_INVITE_VIOLATION_SCORE: score } = process.env;
const windowMs = ORG_INVITE_WINDOW * 60 * 1000;
const max = ORG_INVITE_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many invite attempts, please try again after ${windowInMinutes} minutes`;

const handler = async (req, res) => {
  const type = ViolationTypes.ORG_INVITE;
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
  store: limiterCache('org_invite_limiter'),
};

const orgInviteLimiter = rateLimit(limiterOptions);

module.exports = orgInviteLimiter;
