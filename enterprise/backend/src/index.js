/**
 * SQLGuroo Enterprise Edition - Backend Module
 *
 * This module registers enterprise-only routes and provides services
 * for subscription management, payment processing, and usage quotas.
 *
 * Requires EDITION=enterprise environment variable to be active.
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

/**
 * Register enterprise routes on the Express app
 * @param {express.Application} app - Express application
 */
function registerEnterpriseRoutes(app) {
  logger.info('[Enterprise] Loading enterprise edition routes...');

  const subscriptionRoutes = require('./routes/subscription');
  const adminRoutes = require('./routes/admin');
  const paddleWebhook = require('./routes/webhooks/paddle');

  app.use('/api/subscription', subscriptionRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/webhooks/paddle', paddleWebhook);

  logger.info(
    '[Enterprise] Enterprise routes registered: /api/subscription, /api/admin, /api/webhooks/paddle',
  );
}

/**
 * Get the enterprise SubscriptionService instance
 * @returns {Object} SubscriptionService
 */
function getSubscriptionService() {
  return require('./services/SubscriptionService');
}

/**
 * Get the enterprise PaddleService instance
 * @returns {Object} PaddleService
 */
function getPaddleService() {
  return require('./services/PaddleService');
}

/**
 * Get enterprise query limit middleware
 * @returns {Object} { checkQueryLimit, enforceQueryLimit, incrementQueryCount }
 */
function getQueryLimitMiddleware() {
  return require('./middleware/checkQueryLimit');
}

/**
 * Get enterprise admin middleware
 * @returns {Object} { checkAdminEmail, isAdminEmail, getAdminEmails }
 */
function getAdminMiddleware() {
  return require('./middleware/checkAdminEmail');
}

module.exports = {
  registerEnterpriseRoutes,
  getSubscriptionService,
  getPaddleService,
  getQueryLimitMiddleware,
  getAdminMiddleware,
};
