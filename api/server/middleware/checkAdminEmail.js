/**
 * checkAdminEmail - Edition-aware loader
 *
 * In Enterprise mode: email-based admin access control
 * In Community mode: no admin panel (not registered)
 */
const { isEnterprise } = require('~/server/config/edition');

if (!isEnterprise) {
  const passThrough = (req, res, next) => next();
  module.exports = {
    checkAdminEmail: passThrough,
    isAdminEmail: () => false,
    getAdminEmails: () => [],
  };
} else {
  module.exports = require('../../../enterprise/backend/src/middleware/checkAdminEmail');
}
