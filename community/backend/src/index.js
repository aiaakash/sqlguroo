/**
 * Community Edition - Backend Module
 *
 * Provides permissive defaults for the open-source community edition.
 * No subscription management, no query limits, no payment integration.
 */

const express = require('express');
const { logger } = require('@librechat/data-schemas');

/**
 * Register community routes on the Express app
 * In community mode, subscription routes return permissive defaults.
 * Admin and Paddle webhook routes are NOT registered.
 * @param {express.Application} app - Express application
 */
function registerCommunityRoutes(app) {
  logger.info('[Community] Loading community edition routes...');

  const subscriptionRoutes = require('./routes/subscription');
  app.use('/api/subscription', subscriptionRoutes);

  logger.info('[Community] Community routes registered: /api/subscription (permissive defaults)');
}

/**
 * Get the community SubscriptionService instance (permissive)
 * @returns {Object} CommunitySubscriptionService
 */
function getSubscriptionService() {
  return require('./services/SubscriptionService');
}

/**
 * Get community query limit middleware (pass-through)
 * @returns {Object} { checkQueryLimit, enforceQueryLimit, incrementQueryCount }
 */
function getQueryLimitMiddleware() {
  return require('./middleware/checkQueryLimit');
}

module.exports = {
  registerCommunityRoutes,
  getSubscriptionService,
  getQueryLimitMiddleware,
};
