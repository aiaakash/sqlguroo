/**
 * Edition Configuration
 *
 * Determines whether the application is running in Enterprise or Community (OSS) mode.
 *
 * Set EDITION=enterprise in your environment to enable enterprise features:
 * - Subscription management (Free/Pro/Ultra plans)
 * - Paddle payment integration
 * - Query quota enforcement
 * - Admin panel with subscription/usage management
 *
 * Community mode (default) provides:
 * - No query limits
 * - No subscription gates
 * - All AI models available
 * - No payment integration
 */

const EDITION = (process.env.EDITION || 'community').toLowerCase();

const isEnterprise = EDITION === 'enterprise';
const isCommunity = !isEnterprise;

const features = {
  subscriptions: isEnterprise,
  queryLimits: isEnterprise,
  paddlePayments: isEnterprise,
  adminPanel: isEnterprise,
  usageTracking: isEnterprise,
  modelGating: isEnterprise,
};

module.exports = {
  EDITION,
  isEnterprise,
  isCommunity,
  features,
};
