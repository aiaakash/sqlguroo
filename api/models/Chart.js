const { logger } = require('@librechat/data-schemas');
const { Chart } = require('~/db/models');
const crypto = require('crypto');

/**
 * Generate a unique share ID for public charts
 */
const generateShareId = () => {
  return crypto.randomBytes(12).toString('base64url');
};

/**
 * Get a single chart by ID
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID
 * @returns {Promise<Object|null>}
 */
const getChart = async (user, chartId) => {
  try {
    return await Chart.findOne({ _id: chartId, user, isDeleted: false }).lean();
  } catch (error) {
    logger.error('[getChart] Error getting chart', error);
    return null;
  }
};

/**
 * Get a chart by share ID (for public access)
 * @param {string} shareId - Share ID
 * @returns {Promise<Object|null>}
 */
const getChartByShareId = async (shareId) => {
  try {
    return await Chart.findOne({ shareId, isPublic: true, isDeleted: false }).lean();
  } catch (error) {
    logger.error('[getChartByShareId] Error getting chart by share ID', error);
    return null;
  }
};

/**
 * Get all charts for a user
 * @param {string} user - User ID
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.pageSize - Items per page
 * @param {string} options.folderId - Filter by folder
 * @param {boolean} options.pinnedOnly - Only return pinned charts
 * @param {string} options.search - Search term for name/description
 * @returns {Promise<Object>}
 */
const getCharts = async (user, options = {}) => {
  try {
    const { page = 1, pageSize = 20, folderId, pinnedOnly, search } = options;
    const skip = (page - 1) * pageSize;

    const query = { user, isDeleted: false };

    if (folderId) {
      query.folderId = folderId;
    }

    if (pinnedOnly) {
      query.pinned = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [charts, total] = await Promise.all([
      Chart.find(query)
        .select('-dataSnapshot.rows') // Exclude rows from list view for performance
        .sort({ pinned: -1, updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Chart.countDocuments(query),
    ]);

    return {
      charts,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    logger.error('[getCharts] Error getting charts', error);
    return { charts: [], total: 0, page: 1, pageSize: 20 };
  }
};

/**
 * Create a new chart
 * @param {string} user - User ID
 * @param {Object} chartData - Chart data
 * @returns {Promise<Object>}
 */
const createChart = async (user, chartData) => {
  try {
    const chart = new Chart({
      user,
      name: chartData.name,
      description: chartData.description,
      folderId: chartData.folderId,
      config: chartData.config,
      queryRef: chartData.queryRef,
      dataSnapshot: {
        ...chartData.dataSnapshot,
        capturedAt: new Date(),
      },
      pinned: chartData.pinned || false,
    });

    await chart.save();
    return chart.toObject();
  } catch (error) {
    logger.error('[createChart] Error creating chart', error);
    throw error;
  }
};

/**
 * Update an existing chart
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>}
 */
const updateChart = async (user, chartId, updates) => {
  try {
    const allowedUpdates = ['name', 'description', 'folderId', 'config', 'pinned', 'isPublic'];
    const updateObj = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateObj[key] = updates[key];
      }
    }

    // Handle public sharing
    if (updates.isPublic === true) {
      const existingChart = await Chart.findOne({ _id: chartId, user, isDeleted: false });
      if (existingChart && !existingChart.shareId) {
        updateObj.shareId = generateShareId();
      }
    }

    // Handle folder removal (set to null)
    if (updates.folderId === null) {
      updateObj.$unset = { folderId: '' };
      delete updateObj.folderId;
    }

    return await Chart.findOneAndUpdate(
      { _id: chartId, user, isDeleted: false },
      { $set: updateObj },
      { new: true },
    ).lean();
  } catch (error) {
    logger.error('[updateChart] Error updating chart', error);
    return null;
  }
};

/**
 * Update chart data snapshot (for data refresh)
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID
 * @param {Object} dataSnapshot - New data snapshot
 * @returns {Promise<Object|null>}
 */
const updateChartData = async (user, chartId, dataSnapshot) => {
  try {
    return await Chart.findOneAndUpdate(
      { _id: chartId, user, isDeleted: false },
      {
        $set: {
          dataSnapshot: {
            ...dataSnapshot,
            capturedAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean();
  } catch (error) {
    logger.error('[updateChartData] Error updating chart data', error);
    return null;
  }
};

/**
 * Soft delete a chart
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID
 * @returns {Promise<boolean>}
 */
const deleteChart = async (user, chartId) => {
  try {
    const result = await Chart.findOneAndUpdate(
      { _id: chartId, user, isDeleted: false },
      { $set: { isDeleted: true } },
    );
    return !!result;
  } catch (error) {
    logger.error('[deleteChart] Error deleting chart', error);
    return false;
  }
};

/**
 * Permanently delete charts (cleanup job)
 * @param {string} user - User ID
 * @param {Object} filter - Additional filter criteria
 * @returns {Promise<number>}
 */
const permanentlyDeleteCharts = async (user, filter = {}) => {
  try {
    const result = await Chart.deleteMany({ user, isDeleted: true, ...filter });
    return result.deletedCount;
  } catch (error) {
    logger.error('[permanentlyDeleteCharts] Error permanently deleting charts', error);
    return 0;
  }
};

/**
 * Get chart with full data (including rows)
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID
 * @returns {Promise<Object|null>}
 */
const getChartWithData = async (user, chartId) => {
  try {
    return await Chart.findOne({ _id: chartId, user, isDeleted: false }).lean();
  } catch (error) {
    logger.error('[getChartWithData] Error getting chart with data', error);
    return null;
  }
};

/**
 * Duplicate a chart
 * @param {string} user - User ID
 * @param {string} chartId - Chart ID to duplicate
 * @param {string} newName - Name for the duplicate
 * @returns {Promise<Object|null>}
 */
const duplicateChart = async (user, chartId, newName) => {
  try {
    const original = await Chart.findOne({ _id: chartId, user, isDeleted: false }).lean();
    if (!original) {
      return null;
    }

    const duplicate = new Chart({
      user,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      folderId: original.folderId,
      config: original.config,
      queryRef: original.queryRef,
      dataSnapshot: original.dataSnapshot,
      pinned: false,
      isPublic: false,
    });

    await duplicate.save();
    return duplicate.toObject();
  } catch (error) {
    logger.error('[duplicateChart] Error duplicating chart', error);
    return null;
  }
};

module.exports = {
  getChart,
  getChartByShareId,
  getCharts,
  createChart,
  updateChart,
  updateChartData,
  deleteChart,
  permanentlyDeleteCharts,
  getChartWithData,
  duplicateChart,
};

