const { logger } = require('@librechat/data-schemas');
const { Dashboard, Chart } = require('~/db/models');
const crypto = require('crypto');

/**
 * Generate a unique share ID for public dashboards
 */
const generateShareId = () => {
  return crypto.randomBytes(12).toString('base64url');
};

/**
 * Get a single dashboard by ID
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @returns {Promise<Object|null>}
 */
const getDashboard = async (userId, dashboardId) => {
  try {
    return await Dashboard.findOne({
      _id: dashboardId,
      user: userId,
      isDeleted: false,
    }).lean();
  } catch (error) {
    logger.error('[getDashboard] Error getting dashboard', error);
    return null;
  }
};

/**
 * Get a dashboard by share ID (for public access)
 * @param {string} shareId - Share ID
 * @returns {Promise<Object|null>}
 */
const getDashboardByShareId = async (shareId) => {
  try {
    return await Dashboard.findOne({
      'permissions.shareId': shareId,
      'permissions.isPublic': true,
      isDeleted: false,
    }).lean();
  } catch (error) {
    logger.error('[getDashboardByShareId] Error getting dashboard by share ID', error);
    return null;
  }
};

/**
 * Get all dashboards for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const getDashboards = async (userId, options = {}) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      search,
      starredOnly,
      archivedOnly,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = options;
    const skip = (page - 1) * pageSize;

    const query = {
      user: userId,
      isDeleted: false,
    };

    if (archivedOnly) {
      query.isArchived = true;
    } else {
      query.isArchived = { $ne: true };
    }

    if (starredOnly) {
      query.starred = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $elemMatch: { $regex: search, $options: 'i' } } },
      ];
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Add secondary sort for starred items to appear first
    if (sortBy !== 'starred') {
      sortObj.starred = -1;
    }

    const [dashboards, total] = await Promise.all([
      Dashboard.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Dashboard.countDocuments(query),
    ]);

    // Get chart counts and chart info for each dashboard
    const dashboardsWithMeta = await Promise.all(
      dashboards.map(async (dashboard) => {
        const chartIds = dashboard.charts.map((c) => c.chartId);
        const chartCount = chartIds.length;

        // Get chart previews (basic info)
        let chartPreviews = [];
        if (chartCount > 0) {
          const charts = await Chart.find({
            _id: { $in: chartIds.slice(0, 4) }, // Get first 4 for preview
            isDeleted: false,
          })
            .select('_id name config.type')
            .lean();
          chartPreviews = charts;
        }

        return {
          ...dashboard,
          chartCount,
          chartPreviews,
        };
      })
    );

    return {
      dashboards: dashboardsWithMeta,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    logger.error('[getDashboards] Error getting dashboards', error);
    return { dashboards: [], total: 0, page: 1, pageSize: 20 };
  }
};

/**
 * Get shared dashboards accessible to a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const getSharedDashboards = async (userId, options = {}) => {
  try {
    const { page = 1, pageSize = 20 } = options;
    const skip = (page - 1) * pageSize;

    const query = {
      $or: [
        { 'permissions.viewers': userId },
        { 'permissions.editors': userId },
      ],
      user: { $ne: userId }, // Not owned by the user
      isDeleted: false,
      isArchived: false,
    };

    const [dashboards, total] = await Promise.all([
      Dashboard.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('user', 'name email avatar')
        .lean(),
      Dashboard.countDocuments(query),
    ]);

    return {
      dashboards,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    logger.error('[getSharedDashboards] Error getting shared dashboards', error);
    return { dashboards: [], total: 0, page: 1, pageSize: 20 };
  }
};

/**
 * Create a new dashboard
 * @param {string} userId - User ID
 * @param {Object} dashboardData - Dashboard data
 * @returns {Promise<Object>}
 */
const createDashboard = async (userId, dashboardData) => {
  try {
    const dashboard = new Dashboard({
      user: userId,
      name: dashboardData.name,
      description: dashboardData.description,
      icon: dashboardData.icon || 'dashboard',
      charts: dashboardData.charts || [],
      settings: dashboardData.settings || {
        autoRefresh: 0,
        showBorders: true,
        compactLayout: false,
        allowViewerResize: false,
      },
      permissions: {
        isPublic: false,
      },
      tags: dashboardData.tags || [],
      gridCols: dashboardData.gridCols || 12,
    });

    await dashboard.save();
    return dashboard.toObject();
  } catch (error) {
    logger.error('[createDashboard] Error creating dashboard', error);
    throw error;
  }
};

/**
 * Update a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>}
 */
const updateDashboard = async (userId, dashboardId, updates) => {
  try {
    const allowedUpdates = [
      'name',
      'description',
      'icon',
      'charts',
      'layouts',
      'settings',
      'starred',
      'isArchived',
      'tags',
      'gridCols',
      'thumbnailUrl',
    ];
    const updateObj = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateObj[key] = updates[key];
      }
    }

    // Handle permissions separately to avoid MongoDB update conflicts
    // Can't mix updating the entire 'permissions' object with 'permissions.shareId' dot notation
    if (updates.permissions !== undefined) {
      const existingDashboard = await Dashboard.findOne({
        _id: dashboardId,
        user: userId,
        isDeleted: false,
      });

      if (existingDashboard) {
        // Merge new permissions with existing, generating shareId if making public
        const newPermissions = {
          ...existingDashboard.permissions?.toObject?.() || existingDashboard.permissions || {},
          ...updates.permissions,
        };

        // Generate share ID if making public and doesn't have one
        if (updates.permissions.isPublic === true && !newPermissions.shareId) {
          newPermissions.shareId = generateShareId();
        }

        updateObj.permissions = newPermissions;
      }
    }

    return await Dashboard.findOneAndUpdate(
      { _id: dashboardId, user: userId, isDeleted: false },
      { $set: updateObj },
      { new: true }
    ).lean();
  } catch (error) {
    logger.error('[updateDashboard] Error updating dashboard', error);
    return null;
  }
};

/**
 * Add a chart to a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @param {Object} chartItem - Chart item with position data
 * @returns {Promise<Object|null>}
 */
const addChartToDashboard = async (userId, dashboardId, chartItem) => {
  try {
    // Verify chart exists and belongs to user
    const chart = await Chart.findOne({
      _id: chartItem.chartId,
      user: userId,
      isDeleted: false,
    });
    if (!chart) {
      throw new Error('Chart not found');
    }

    return await Dashboard.findOneAndUpdate(
      { _id: dashboardId, user: userId, isDeleted: false },
      {
        $push: {
          charts: {
            chartId: chartItem.chartId,
            x: chartItem.x ?? 0,
            y: chartItem.y ?? 0,
            w: chartItem.w ?? 4,
            h: chartItem.h ?? 2,
            titleOverride: chartItem.titleOverride,
            static: chartItem.static ?? false,
          },
        },
      },
      { new: true }
    ).lean();
  } catch (error) {
    logger.error('[addChartToDashboard] Error adding chart to dashboard', error);
    return null;
  }
};

/**
 * Remove a chart from a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @param {string} chartId - Chart ID to remove
 * @returns {Promise<Object|null>}
 */
const removeChartFromDashboard = async (userId, dashboardId, chartId) => {
  try {
    return await Dashboard.findOneAndUpdate(
      { _id: dashboardId, user: userId, isDeleted: false },
      { $pull: { charts: { chartId } } },
      { new: true }
    ).lean();
  } catch (error) {
    logger.error('[removeChartFromDashboard] Error removing chart from dashboard', error);
    return null;
  }
};

/**
 * Update chart layout in a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @param {Array} charts - Updated chart items with positions
 * @returns {Promise<Object|null>}
 */
const updateDashboardLayout = async (userId, dashboardId, charts) => {
  try {
    return await Dashboard.findOneAndUpdate(
      { _id: dashboardId, user: userId, isDeleted: false },
      { $set: { charts } },
      { new: true }
    ).lean();
  } catch (error) {
    logger.error('[updateDashboardLayout] Error updating dashboard layout', error);
    return null;
  }
};

/**
 * Duplicate a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID to duplicate
 * @param {string} newName - Optional new name
 * @returns {Promise<Object|null>}
 */
const duplicateDashboard = async (userId, dashboardId, newName) => {
  try {
    const original = await Dashboard.findOne({
      _id: dashboardId,
      user: userId,
      isDeleted: false,
    }).lean();

    if (!original) {
      return null;
    }

    const duplicate = new Dashboard({
      user: userId,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      icon: original.icon,
      charts: original.charts,
      layouts: original.layouts,
      settings: original.settings,
      tags: original.tags,
      gridCols: original.gridCols,
      permissions: {
        isPublic: false,
      },
      starred: false,
    });

    await duplicate.save();
    return duplicate.toObject();
  } catch (error) {
    logger.error('[duplicateDashboard] Error duplicating dashboard', error);
    return null;
  }
};

/**
 * Soft delete a dashboard
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @returns {Promise<boolean>}
 */
const deleteDashboard = async (userId, dashboardId) => {
  try {
    const result = await Dashboard.findOneAndUpdate(
      { _id: dashboardId, user: userId, isDeleted: false },
      { $set: { isDeleted: true } }
    );
    return !!result;
  } catch (error) {
    logger.error('[deleteDashboard] Error deleting dashboard', error);
    return false;
  }
};

/**
 * Get dashboard with populated chart data
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @returns {Promise<Object|null>}
 */
const getDashboardWithCharts = async (userId, dashboardId) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: dashboardId,
      user: userId,
      isDeleted: false,
    }).lean();

    if (!dashboard) {
      return null;
    }

    // Get all chart data
    const chartIds = dashboard.charts.map((c) => c.chartId);
    const charts = await Chart.find({
      _id: { $in: chartIds },
      isDeleted: false,
    }).lean();

    // Create a map for quick lookup
    const chartMap = charts.reduce((acc, chart) => {
      acc[chart._id.toString()] = chart;
      return acc;
    }, {});

    // Merge chart data with layout info
    const chartsWithData = dashboard.charts
      .map((item) => {
        const chart = chartMap[item.chartId.toString()];
        if (!chart) return null;
        return {
          ...item,
          chart,
        };
      })
      .filter(Boolean);

    return {
      ...dashboard,
      chartsWithData,
    };
  } catch (error) {
    logger.error('[getDashboardWithCharts] Error getting dashboard with charts', error);
    return null;
  }
};

/**
 * Get public dashboard with chart data
 * @param {string} shareId - Share ID
 * @returns {Promise<Object|null>}
 */
const getPublicDashboardWithCharts = async (shareId) => {
  try {
    const dashboard = await Dashboard.findOne({
      'permissions.shareId': shareId,
      'permissions.isPublic': true,
      isDeleted: false,
    }).lean();

    if (!dashboard) {
      return null;
    }

    // Get all chart data (public charts only)
    const chartIds = dashboard.charts.map((c) => c.chartId);
    const charts = await Chart.find({
      _id: { $in: chartIds },
      isDeleted: false,
    }).lean();

    // Create a map for quick lookup
    const chartMap = charts.reduce((acc, chart) => {
      acc[chart._id.toString()] = chart;
      return acc;
    }, {});

    // Merge chart data with layout info
    const chartsWithData = dashboard.charts
      .map((item) => {
        const chart = chartMap[item.chartId.toString()];
        if (!chart) return null;
        return {
          ...item,
          chart,
        };
      })
      .filter(Boolean);

    return {
      ...dashboard,
      chartsWithData,
    };
  } catch (error) {
    logger.error('[getPublicDashboardWithCharts] Error getting public dashboard', error);
    return null;
  }
};

/**
 * Toggle starred status
 * @param {string} userId - User ID
 * @param {string} dashboardId - Dashboard ID
 * @returns {Promise<Object|null>}
 */
const toggleDashboardStar = async (userId, dashboardId) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: dashboardId,
      user: userId,
      isDeleted: false,
    });

    if (!dashboard) {
      return null;
    }

    dashboard.starred = !dashboard.starred;
    await dashboard.save();
    return dashboard.toObject();
  } catch (error) {
    logger.error('[toggleDashboardStar] Error toggling star', error);
    return null;
  }
};

module.exports = {
  getDashboard,
  getDashboardByShareId,
  getDashboards,
  getSharedDashboards,
  createDashboard,
  updateDashboard,
  addChartToDashboard,
  removeChartFromDashboard,
  updateDashboardLayout,
  duplicateDashboard,
  deleteDashboard,
  getDashboardWithCharts,
  getPublicDashboardWithCharts,
  toggleDashboardStar,
};

