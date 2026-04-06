# SQLGuroo Enterprise Edition

## License

Usage of files in this directory and its subdirectories, and of SQLGuroo Enterprise Edition features, is subject to the [SQLGuroo Commercial License](./LICENSE.txt), and conditional on having a fully-paid-up license from SQLGuroo. Access to files in this directory and its subdirectories does not constitute permission to use this code or SQLGuroo Enterprise Edition features.

## What's Included

Enterprise-only features that are conditionally loaded when `EDITION=enterprise`:

### Backend (`enterprise/backend/src/`)

- **SubscriptionService** - Full subscription lifecycle management (Free/Pro/Ultra plans)
- **PaddleService** - Paddle payment gateway integration
- **Subscription Routes** - REST API for subscription management, checkout, plan changes
- **Admin Routes** - Admin panel for user/subscription/usage management
- **Paddle Webhooks** - Webhook handler for Paddle subscription events
- **Query Limit Middleware** - Enforces per-plan query quotas
- **Admin Auth Middleware** - Email-based admin access control

### Frontend (`enterprise/frontend/src/`)

- **PricingPlans** - Three-tier pricing modal with Paddle checkout
- **AccountPage** - Subscription management UI with usage metrics
- **QuotaDisplay** - Query usage progress bar in chat header
- **UpgradeReminder** - Upgrade prompt for free-tier users

## Running Enterprise Edition

### Environment

Set the `EDITION` environment variable:

```bash
EDITION=enterprise
```

## Community Edition

The Community Edition (default) does not include subscription management, query limits, or payment integration. All users have unlimited access to all features.

Set `EDITION=community` or omit the variable to run Community Edition.
