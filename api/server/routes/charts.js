const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  getChart,
  getChartByShareId,
  getCharts,
  createChart,
  updateChart,
  updateChartData,
  deleteChart,
  getChartWithData,
  duplicateChart,
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { DatabaseConnection } = require('~/db/models');
const { decryptCredentials } = require('~/server/services/Analytics/encryption');
const { executeQuery } = require('~/server/services/Analytics/queryExecutor');
const { getSampleDbWithCredentials } = require('~/server/services/Analytics/sampleDbService');
const { getUserOrgMembership } = require('~/server/services/OrganizationService');

const router = express.Router();

/**
 * @route GET /api/charts
 * @description Get all charts for the authenticated user
 * @query {number} page - Page number (default: 1)
 * @query {number} pageSize - Items per page (default: 20)
 * @query {string} folderId - Filter by folder ID
 * @query {boolean} pinnedOnly - Only return pinned charts
 * @query {string} search - Search term
 */
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: Math.min(parseInt(req.query.pageSize) || 20, 100), // Max 100
      folderId: req.query.folderId,
      pinnedOnly: req.query.pinnedOnly === 'true',
      search: req.query.search,
      organizationId: userOrgId,
    };

    const result = await getCharts(req.user.id, options);
    res.status(200).json(result);
  } catch (error) {
    logger.error('[GET /charts] Error listing charts', error);
    res.status(500).json({ error: 'Failed to fetch charts' });
  }
});

/**
 * @route GET /api/charts/public/:shareId
 * @description Get a public chart by share ID (no auth required)
 */
router.get('/public/:shareId', async (req, res) => {
  try {
    const chart = await getChartByShareId(req.params.shareId);
    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }
    res.status(200).json(chart);
  } catch (error) {
    logger.error('[GET /charts/public/:shareId] Error fetching public chart', error);
    res.status(500).json({ error: 'Failed to fetch chart' });
  }
});

/**
 * @route GET /api/charts/:chartId
 * @description Get a single chart by ID
 */
router.get('/:chartId', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    const chart = await getChart(req.user.id, req.params.chartId, userOrgId);
    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }
    res.status(200).json(chart);
  } catch (error) {
    logger.error('[GET /charts/:chartId] Error fetching chart', error);
    res.status(500).json({ error: 'Failed to fetch chart' });
  }
});

/**
 * @route GET /api/charts/:chartId/data
 * @description Get a chart with full data (including rows)
 * @query {boolean} refresh - If true, re-run the query to get fresh data (if queryRef is available)
 */
router.get('/:chartId/data', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    const chart = await getChartWithData(req.user.id, req.params.chartId, userOrgId);
    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    const shouldRefresh = req.query.refresh === 'true';

    // If refresh requested and we have queryRef with SQL and connectionId, re-run the query
    if (shouldRefresh && chart.queryRef?.sql && chart.queryRef?.connectionId) {
      try {
        let connection;
        let password;
        let sslCertificate;
        
        if (chart.queryRef.connectionId === 'sample-db') {
          // Handle sample database
          connection = getSampleDbWithCredentials();
          if (connection) {
            password = connection.password; // Not encrypted
            sslCertificate = connection.sslCertificate;
          }
        } else {
          let dbQuery = { _id: chart.queryRef.connectionId, isDeleted: false };
          if (userOrgId) {
            dbQuery.$or = [{ user: req.user.id }, { organizationId: userOrgId }];
          } else {
            dbQuery.user = req.user.id;
          }
          connection = await DatabaseConnection.findOne(dbQuery).select('+password +sslCertificate');
          
          if (connection && connection.isActive) {
            password = decryptCredentials(connection.password);
            sslCertificate = connection.sslCertificate
              ? decryptCredentials(connection.sslCertificate)
              : undefined;
          }
        }

        if (connection && connection.isActive) {
          const queryResult = await executeQuery({
            type: connection.type,
            host: connection.host,
            port: connection.port,
            database: connection.database,
            username: connection.username,
            password: password,
            ssl: connection.ssl,
            sslCertificate: sslCertificate,
            sql: chart.queryRef.sql,
            queryMode: connection.queryMode,
            timeout: connection.queryTimeout,
            maxRows: connection.maxRows,
          });

          // Transform query results to chart data format
          const columns = queryResult.columns.map((col) => ({
            name: col.name,
            type: col.type || 'string',
          }));

          const rows = queryResult.rows.map((row) => {
            const rowObj = {};
            columns.forEach((col) => {
              rowObj[col.name] = row[col.name];
            });
            return rowObj;
          });

          // Update the chart's data snapshot in the database
          await updateChartData(req.user.id, req.params.chartId, {
            columns,
            rows,
            rowCount: rows.length,
            capturedAt: new Date(),
          }, userOrgId);

          return res.status(200).json({
            chart,
            data: {
              columns,
              rows,
              rowCount: rows.length,
              refreshedAt: new Date(),
              fromCache: false,
            },
          });
        }
      } catch (refreshError) {
        logger.warn('[GET /charts/:chartId/data] Failed to refresh data, returning cached:', refreshError.message);
        // Fall through to return cached data
      }
    }

    // Return cached data from snapshot
    res.status(200).json({
      chart,
      data: {
        columns: chart.dataSnapshot?.columns || [],
        rows: chart.dataSnapshot?.rows || [],
        rowCount: chart.dataSnapshot?.rowCount || 0,
        refreshedAt: chart.dataSnapshot?.capturedAt || chart.updatedAt,
        fromCache: true,
      },
    });
  } catch (error) {
    logger.error('[GET /charts/:chartId/data] Error fetching chart data', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

/**
 * @route POST /api/charts
 * @description Create a new chart
 */
router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { name, description, folderId, config, queryRef, dataSnapshot, pinned } = req.body;

    // Validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Chart name is required' });
    }

    if (!config || !config.type || !config.xAxis) {
      return res.status(400).json({ error: 'Chart configuration is required' });
    }

    if (!dataSnapshot || !dataSnapshot.columns || !dataSnapshot.rows) {
      return res.status(400).json({ error: 'Data snapshot is required' });
    }

    // Validate data limits (10k rows max)
    if (dataSnapshot.rows.length > 10000) {
      return res.status(400).json({ error: 'Data exceeds maximum of 10,000 rows' });
    }

    const chart = await createChart(req.user.id, {
      name: name.trim(),
      description: description?.trim(),
      folderId,
      config,
      queryRef,
      dataSnapshot: {
        ...dataSnapshot,
        rowCount: dataSnapshot.rows.length,
      },
      pinned: pinned || false,
    }, userOrgId);

    res.status(201).json(chart);
  } catch (error) {
    logger.error('[POST /charts] Error creating chart', error);
    res.status(500).json({ error: 'Failed to create chart' });
  }
});

/**
 * @route PUT /api/charts/:chartId
 * @description Update a chart
 */
router.put('/:chartId', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { name, description, folderId, config, pinned, isPublic } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (folderId !== undefined) updates.folderId = folderId;
    if (config !== undefined) updates.config = config;
    if (pinned !== undefined) updates.pinned = pinned;
    if (isPublic !== undefined) updates.isPublic = isPublic;

    const chart = await updateChart(req.user.id, req.params.chartId, updates, userOrgId);
    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    res.status(200).json(chart);
  } catch (error) {
    logger.error('[PUT /charts/:chartId] Error updating chart', error);
    res.status(500).json({ error: 'Failed to update chart' });
  }
});

/**
 * @route PUT /api/charts/:chartId/data
 * @description Update chart data snapshot (refresh data)
 */
router.put('/:chartId/data', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { dataSnapshot } = req.body;

    if (!dataSnapshot || !dataSnapshot.columns || !dataSnapshot.rows) {
      return res.status(400).json({ error: 'Data snapshot is required' });
    }

    // Validate data limits (10k rows max)
    if (dataSnapshot.rows.length > 10000) {
      return res.status(400).json({ error: 'Data exceeds maximum of 10,000 rows' });
    }

    const chart = await updateChartData(req.user.id, req.params.chartId, {
      ...dataSnapshot,
      rowCount: dataSnapshot.rows.length,
    }, userOrgId);

    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    res.status(200).json(chart);
  } catch (error) {
    logger.error('[PUT /charts/:chartId/data] Error updating chart data', error);
    res.status(500).json({ error: 'Failed to update chart data' });
  }
});

/**
 * @route POST /api/charts/:chartId/refresh
 * @description Refresh chart data by re-running the saved SQL query
 */
router.post('/:chartId/refresh', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    const chart = await getChartWithData(req.user.id, req.params.chartId, userOrgId);
    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    // Check if chart has queryRef with SQL and connectionId
    if (!chart.queryRef?.sql || !chart.queryRef?.connectionId) {
      return res.status(400).json({
        error: 'Chart does not have a saved query. Cannot refresh data.',
        hasQueryRef: false,
      });
    }

    // Get database connection
    let connection;
    let password;
    let sslCertificate;
    
    if (chart.queryRef.connectionId === 'sample-db') {
      // Handle sample database
      connection = getSampleDbWithCredentials();
      if (!connection) {
        return res.status(404).json({ error: 'Sample database is not configured' });
      }
      password = connection.password; // Not encrypted
      sslCertificate = connection.sslCertificate;
    } else {
      let dbQuery = { _id: chart.queryRef.connectionId, isDeleted: false };
      if (userOrgId) {
        dbQuery.$or = [{ user: req.user.id }, { organizationId: userOrgId }];
      } else {
        dbQuery.user = req.user.id;
      }
      connection = await DatabaseConnection.findOne(dbQuery).select('+password +sslCertificate');

      if (!connection) {
        return res.status(404).json({ error: 'Database connection not found' });
      }

      if (!connection.isActive) {
        return res.status(400).json({ error: 'Database connection is inactive' });
      }
      
      password = decryptCredentials(connection.password);
      sslCertificate = connection.sslCertificate
        ? decryptCredentials(connection.sslCertificate)
        : undefined;
    }

    // Execute the query
    const queryResult = await executeQuery({
      type: connection.type,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: password,
      ssl: connection.ssl,
      sslCertificate: sslCertificate,
      sql: chart.queryRef.sql,
      queryMode: connection.queryMode,
      timeout: connection.queryTimeout,
      maxRows: connection.maxRows,
    });

    // Transform query results to chart data format
    const columns = queryResult.columns.map((col) => ({
      name: col.name,
      type: col.type || 'string',
    }));

    const rows = queryResult.rows.map((row) => {
      const rowObj = {};
      columns.forEach((col) => {
        rowObj[col.name] = row[col.name];
      });
      return rowObj;
    });

    // Update the chart's data snapshot
    const updatedChart = await updateChartData(req.user.id, req.params.chartId, {
      columns,
      rows,
      rowCount: rows.length,
      capturedAt: new Date(),
    }, userOrgId);

    res.status(200).json({
      chart: updatedChart,
      data: {
        columns,
        rows,
        rowCount: rows.length,
        refreshedAt: new Date(),
        fromCache: false,
      },
    });
  } catch (error) {
    logger.error('[POST /charts/:chartId/refresh] Error refreshing chart data', error);
    res.status(500).json({ error: error.message || 'Failed to refresh chart data' });
  }
});

/**
 * @route POST /api/charts/:chartId/duplicate
 * @description Duplicate a chart
 */
router.post('/:chartId/duplicate', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { name } = req.body;
    const chart = await duplicateChart(req.user.id, req.params.chartId, name, userOrgId);

    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    res.status(201).json(chart);
  } catch (error) {
    logger.error('[POST /charts/:chartId/duplicate] Error duplicating chart', error);
    res.status(500).json({ error: 'Failed to duplicate chart' });
  }
});

/**
 * @route DELETE /api/charts/:chartId
 * @description Soft delete a chart
 */
router.delete('/:chartId', requireJwtAuth, async (req, res) => {
  try {
    const membership = await getUserOrgMembership(req.user.id);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const success = await deleteChart(req.user.id, req.params.chartId, userOrgId);
    if (!success) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[DELETE /charts/:chartId] Error deleting chart', error);
    res.status(500).json({ error: 'Failed to delete chart' });
  }
});

module.exports = router;

