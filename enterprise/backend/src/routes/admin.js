const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { User, Subscription, Usage, Organization } = require('@librechat/data-schemas').createModels(mongoose);
const { requireJwtAuth } = require('~/server/middleware');
const { checkAdminEmail, getAdminEmails } = require('../middleware/checkAdminEmail');
const subscriptionService = require('../services/SubscriptionService');

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkAdminEmail);

router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = Math.min(parseInt(pageSize), 100);

    const searchQuery = search
      ? {
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const total = await User.countDocuments(searchQuery);

    const users = await User.find(searchQuery)
      .select(
        'email username name role provider emailVerified twoFactorEnabled termsAccepted createdAt updatedAt',
      )
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        try {
          const userId = user._id.toString();
          const subscription = await subscriptionService.getCurrentSubscription(userId);
          const usage = await subscriptionService.getUsageStats(userId);
          const planDetails = subscriptionService.getPlanDetails(subscription.plan);

          let orgInfo = null;
          try {
            const org = await Organization.findOne({ createdBy: userId }).select('name').lean();
            if (org) {
              orgInfo = { name: org.name, isOwner: true };
            } else {
              const membership = await mongoose.model('OrganizationMembership')
                .findOne({ userId: user._id })
                .populate('organizationId', 'name')
                .lean();
              if (membership && membership.organizationId) {
                orgInfo = { name: membership.organizationId.name, isOwner: false };
              }
            }
          } catch {
          }

          return {
            id: userId,
            email: user.email,
            username: user.username || null,
            name: user.name || null,
            role: user.role || 'USER',
            provider: user.provider || 'local',
            emailVerified: user.emailVerified || false,
            twoFactorEnabled: user.twoFactorEnabled || false,
            termsAccepted: user.termsAccepted || false,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            subscription: {
              plan: subscription.plan,
              status: subscription.status,
              billingCycle: subscription.billingCycle,
              isImplicit: subscription.isImplicit || false,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
            },
            usage: {
              queryCount: usage.queryCount || 0,
              limit: usage.limit || 0,
              percentage: usage.percentage || 0,
              periodStart: usage.periodStart,
              periodEnd: usage.periodEnd,
            },
            planLimits: {
              queryLimit: planDetails.queryLimit,
              features: planDetails.features,
            },
            organization: orgInfo,
          };
        } catch (err) {
          logger.error(`[Admin] Error getting details for user ${user._id}:`, err);
          return {
            id: user._id.toString(),
            email: user.email,
            username: user.username || null,
            name: user.name || null,
            role: user.role || 'USER',
            provider: user.provider || 'local',
            emailVerified: user.emailVerified || false,
            twoFactorEnabled: user.twoFactorEnabled || false,
            termsAccepted: user.termsAccepted || false,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            subscription: { plan: 'unknown', status: 'unknown', error: true },
            usage: { queryCount: 0, limit: 0, percentage: 0, error: true },
            planLimits: { queryLimit: 0, features: [] },
            organization: null,
          };
        }
      }),
    );

    res.json({
      users: usersWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('[Admin] Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select(
        'email username name role provider emailVerified twoFactorEnabled termsAccepted plugins favorites createdAt updatedAt',
      )
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await subscriptionService.getCurrentSubscription(userId);
    const subscriptionHistory = await subscriptionService.getSubscriptionHistory(userId);
    const usage = await subscriptionService.getUsageStats(userId);
    const planDetails = subscriptionService.getPlanDetails(subscription.plan);

    res.json({
      id: userId,
      email: user.email,
      username: user.username || null,
      name: user.name || null,
      role: user.role || 'USER',
      provider: user.provider || 'local',
      emailVerified: user.emailVerified || false,
      twoFactorEnabled: user.twoFactorEnabled || false,
      termsAccepted: user.termsAccepted || false,
      pluginsCount: user.plugins?.length || 0,
      favoritesCount: user.favorites?.length || 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      subscription: {
        current: {
          plan: subscription.plan,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          isImplicit: subscription.isImplicit || false,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        history: subscriptionHistory,
      },
      usage: {
        queryCount: usage.queryCount || 0,
        limit: usage.limit || 0,
        percentage: usage.percentage || 0,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
      },
      planLimits: {
        queryLimit: planDetails.queryLimit,
        features: planDetails.features,
      },
    });
  } catch (error) {
    logger.error('[Admin] Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();

    const usersByRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);

    const usersByProvider = await User.aggregate([
      { $group: { _id: '$provider', count: { $sum: 1 } } },
    ]);

    const subscriptionStats = await Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trialing'] } } },
      { $group: { _id: '$plan', count: { $sum: 1 } } },
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersLast7Days = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const activeUsers = await Usage.distinct('userId');

    res.json({
      totalUsers,
      newUsersLast7Days,
      newUsersLast30Days,
      activeUsers: activeUsers.length,
      usersByRole: usersByRole.reduce((acc, item) => {
        acc[item._id || 'USER'] = item.count;
        return acc;
      }, {}),
      usersByProvider: usersByProvider.reduce((acc, item) => {
        acc[item._id || 'local'] = item.count;
        return acc;
      }, {}),
      subscriptionStats: subscriptionStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      adminEmails: getAdminEmails(),
    });
  } catch (error) {
    logger.error('[Admin] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/check', (req, res) => {
  res.json({ isAdmin: true, email: req.user.email });
});

module.exports = router;
