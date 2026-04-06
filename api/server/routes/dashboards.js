const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
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
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

/**
 * @route GET /api/dashboards
 * @description Get all dashboards for the authenticated user
 * @query {number} page - Page number (default: 1)
 * @query {number} pageSize - Items per page (default: 20)
 * @query {string} search - Search term
 * @query {boolean} starredOnly - Only return starred dashboards
 * @query {boolean} archivedOnly - Only return archived dashboards
 * @query {string} sortBy - Sort field (default: updatedAt)
 * @query {string} sortOrder - Sort order: asc|desc (default: desc)
 */
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: Math.min(parseInt(req.query.pageSize) || 20, 100),
      search: req.query.search,
      starredOnly: req.query.starredOnly === 'true',
      archivedOnly: req.query.archivedOnly === 'true',
      sortBy: req.query.sortBy || 'updatedAt',
      sortOrder: req.query.sortOrder || 'desc',
    };

    const result = await getDashboards(req.user.id, options);
    res.status(200).json(result);
  } catch (error) {
    logger.error('[GET /dashboards] Error listing dashboards', error);
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

/**
 * @route GET /api/dashboards/shared
 * @description Get dashboards shared with the authenticated user
 */
router.get('/shared', requireJwtAuth, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: Math.min(parseInt(req.query.pageSize) || 20, 100),
    };

    const result = await getSharedDashboards(req.user.id, options);
    res.status(200).json(result);
  } catch (error) {
    logger.error('[GET /dashboards/shared] Error listing shared dashboards', error);
    res.status(500).json({ error: 'Failed to fetch shared dashboards' });
  }
});

/**
 * @route GET /api/dashboards/public/:shareId
 * @description Get a public dashboard by share ID (no auth required)
 */
router.get('/public/:shareId', async (req, res) => {
  try {
    const dashboard = await getPublicDashboardWithCharts(req.params.shareId);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[GET /dashboards/public/:shareId] Error fetching public dashboard', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * @route GET /api/dashboards/:dashboardId
 * @description Get a single dashboard by ID
 */
router.get('/:dashboardId', requireJwtAuth, async (req, res) => {
  try {
    const dashboard = await getDashboard(req.user.id, req.params.dashboardId);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[GET /dashboards/:dashboardId] Error fetching dashboard', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * @route GET /api/dashboards/:dashboardId/full
 * @description Get a dashboard with full chart data
 */
router.get('/:dashboardId/full', requireJwtAuth, async (req, res) => {
  try {
    const dashboard = await getDashboardWithCharts(req.user.id, req.params.dashboardId);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[GET /dashboards/:dashboardId/full] Error fetching dashboard', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * @route POST /api/dashboards
 * @description Create a new dashboard
 */
router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { name, description, icon, charts, settings, tags, gridCols } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Dashboard name is required' });
    }

    const dashboard = await createDashboard(req.user.id, {
      name: name.trim(),
      description: description?.trim(),
      icon,
      charts: charts || [],
      settings,
      tags,
      gridCols,
    });

    res.status(201).json(dashboard);
  } catch (error) {
    logger.error('[POST /dashboards] Error creating dashboard', error);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

/**
 * @route PUT /api/dashboards/:dashboardId
 * @description Update a dashboard
 */
router.put('/:dashboardId', requireJwtAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      charts,
      layouts,
      settings,
      permissions,
      starred,
      isArchived,
      tags,
      gridCols,
    } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (icon !== undefined) updates.icon = icon;
    if (charts !== undefined) updates.charts = charts;
    if (layouts !== undefined) updates.layouts = layouts;
    if (settings !== undefined) updates.settings = settings;
    if (permissions !== undefined) updates.permissions = permissions;
    if (starred !== undefined) updates.starred = starred;
    if (isArchived !== undefined) updates.isArchived = isArchived;
    if (tags !== undefined) updates.tags = tags;
    if (gridCols !== undefined) updates.gridCols = gridCols;

    const dashboard = await updateDashboard(req.user.id, req.params.dashboardId, updates);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[PUT /dashboards/:dashboardId] Error updating dashboard', error);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

/**
 * @route PUT /api/dashboards/:dashboardId/layout
 * @description Update dashboard chart layout
 */
router.put('/:dashboardId/layout', requireJwtAuth, async (req, res) => {
  try {
    const { charts } = req.body;

    if (!Array.isArray(charts)) {
      return res.status(400).json({ error: 'Charts array is required' });
    }

    const dashboard = await updateDashboardLayout(req.user.id, req.params.dashboardId, charts);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[PUT /dashboards/:dashboardId/layout] Error updating layout', error);
    res.status(500).json({ error: 'Failed to update layout' });
  }
});

/**
 * @route POST /api/dashboards/:dashboardId/charts
 * @description Add a chart to a dashboard
 */
router.post('/:dashboardId/charts', requireJwtAuth, async (req, res) => {
  try {
    const { chartId, x, y, w, h, titleOverride, static: isStatic } = req.body;

    if (!chartId) {
      return res.status(400).json({ error: 'Chart ID is required' });
    }

    const dashboard = await addChartToDashboard(req.user.id, req.params.dashboardId, {
      chartId,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? 4,
      h: h ?? 2,
      titleOverride,
      static: isStatic ?? false,
    });

    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard or chart not found' });
    }

    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[POST /dashboards/:dashboardId/charts] Error adding chart', error);
    res.status(500).json({ error: 'Failed to add chart' });
  }
});

/**
 * @route DELETE /api/dashboards/:dashboardId/charts/:chartId
 * @description Remove a chart from a dashboard
 */
router.delete('/:dashboardId/charts/:chartId', requireJwtAuth, async (req, res) => {
  try {
    const dashboard = await removeChartFromDashboard(
      req.user.id,
      req.params.dashboardId,
      req.params.chartId
    );

    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[DELETE /dashboards/:dashboardId/charts/:chartId] Error removing chart', error);
    res.status(500).json({ error: 'Failed to remove chart' });
  }
});

/**
 * @route POST /api/dashboards/:dashboardId/duplicate
 * @description Duplicate a dashboard
 */
router.post('/:dashboardId/duplicate', requireJwtAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const dashboard = await duplicateDashboard(req.user.id, req.params.dashboardId, name);

    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(201).json(dashboard);
  } catch (error) {
    logger.error('[POST /dashboards/:dashboardId/duplicate] Error duplicating dashboard', error);
    res.status(500).json({ error: 'Failed to duplicate dashboard' });
  }
});

/**
 * @route POST /api/dashboards/:dashboardId/star
 * @description Toggle star status for a dashboard
 */
router.post('/:dashboardId/star', requireJwtAuth, async (req, res) => {
  try {
    const dashboard = await toggleDashboardStar(req.user.id, req.params.dashboardId);

    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(200).json(dashboard);
  } catch (error) {
    logger.error('[POST /dashboards/:dashboardId/star] Error toggling star', error);
    res.status(500).json({ error: 'Failed to toggle star' });
  }
});

/**
 * @route DELETE /api/dashboards/:dashboardId
 * @description Soft delete a dashboard
 */
router.delete('/:dashboardId', requireJwtAuth, async (req, res) => {
  try {
    const success = await deleteDashboard(req.user.id, req.params.dashboardId);
    if (!success) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[DELETE /dashboards/:dashboardId] Error deleting dashboard', error);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

module.exports = router;

