const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { GitHubRepoConnection } = require('~/db/models');
const { requireJwtAuth } = require('~/server/middleware');
const { getUserOrgMembership } = require('~/server/services/OrganizationService');
const {
  encryptCredentials,
  decryptCredentials,
} = require('~/server/services/Analytics/encryption');
const {
  testGitHubConnection,
  syncGitHubQueries,
  getAccessToken,
} = require('~/server/services/Analytics/githubService');
const {
  storeGitHubQueriesInCache,
  clearGitHubQueriesCache,
} = require('~/server/services/Analytics/githubQueryRAG');

const router = express.Router();

// All routes require authentication
router.use(requireJwtAuth);

/**
 * @route GET /api/github-connections
 * @desc Get all GitHub repo connections for the authenticated user
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    let query;
    if (userOrgId) {
      query = { isActive: true, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { userId, isActive: true };
    }

    const connections = await GitHubRepoConnection.find(query).select('-accessToken');

    res.status(200).json(connections);
  } catch (error) {
    logger.error('Error fetching GitHub connections:', error);
    res.status(500).json({ error: 'Error fetching GitHub connections' });
  }
});

/**
 * @route POST /api/github-connections/test
 * @desc Test GitHub repository connection
 * @access Private
 */
router.post('/test', async (req, res) => {
  try {
    const { owner, repo, accessToken, branch = 'main' } = req.body;

    if (!owner || !repo || !accessToken) {
      return res.status(400).json({ error: 'Owner, repo, and accessToken are required' });
    }

    const result = await testGitHubConnection({
      accessToken,
      owner,
      repo,
      branch,
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.error('Error testing GitHub connection:', error);
    res.status(500).json({ error: 'Failed to test GitHub connection' });
  }
});

/**
 * @route POST /api/github-connections
 * @desc Create a new GitHub repo connection
 * @access Private
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const {
      name,
      owner,
      repo,
      branch = 'main',
      queryPath,
      includePatterns,
      excludePatterns,
      accessToken,
      connectionIds = [],
    } = req.body;

    if (!name || !owner || !repo || !accessToken) {
      return res.status(400).json({ error: 'Name, owner, repo, and accessToken are required' });
    }

    // Check if connection with same name already exists
    let query;
    if (userOrgId) {
      query = { name, isActive: true, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { userId, name, isActive: true };
    }
    const existing = await GitHubRepoConnection.findOne(query);

    if (existing) {
      return res.status(409).json({ error: 'A GitHub connection with this name already exists' });
    }

    // Encrypt the access token
    logger.debug('[GitHub Connection] Encrypting access token', {
      tokenLength: accessToken.length,
    });
    const encryptedToken = encryptCredentials(accessToken);
    logger.debug('[GitHub Connection] Access token encrypted', {
      encryptedLength: encryptedToken.length,
      encryptedPrefix: encryptedToken.substring(0, 50),
    });

    // Create the connection
    const connection = await GitHubRepoConnection.create({
      userId,
      name,
      owner,
      repo,
      branch,
      queryPath,
      includePatterns: includePatterns || ['**/*.sql'],
      excludePatterns: excludePatterns || ['**/node_modules/**', '**/.git/**'],
      accessToken: encryptedToken,
      connectionIds,
      organizationId: userOrgId || undefined,
    });

    logger.info('[GitHub Connection] Created new GitHub repo connection:', {
      userId,
      name,
      owner,
      repo,
      storedTokenLength: connection.accessToken?.length,
      storedTokenIsString: typeof connection.accessToken === 'string',
      connectionIds: connection.connectionIds,
    });

    res.status(201).json(connection.toObject());
  } catch (error) {
    logger.error('Error creating GitHub connection:', error);
    res.status(500).json({ error: 'Failed to create GitHub connection' });
  }
});

/**
 * @route POST /api/github-connections/:id/sync
 * @desc Sync SQL queries from GitHub repository
 * @access Private
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    let query;
    if (userOrgId) {
      query = { _id: id, isActive: true, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { _id: id, userId, isActive: true };
    }

    const connection = await GitHubRepoConnection.findOne(query).select('+accessToken');

    if (!connection) {
      return res.status(404).json({ error: 'GitHub connection not found' });
    }

    logger.debug('[GitHub Connection] Found connection for sync', {
      connectionId: id,
      hasAccessToken: !!connection.accessToken,
      accessTokenLength: connection.accessToken?.length,
    });

    // Get decrypted access token
    let accessToken;
    try {
      accessToken = await getAccessToken(connection);
    } catch (error) {
      logger.error('[GitHub Connection] Failed to decrypt access token:', {
        error: error.message,
        connectionId: id,
        userId,
        hasStoredToken: !!connection.accessToken,
        storedTokenLength: connection.accessToken?.length,
        storedTokenPrefix: connection.accessToken?.substring(0, 50),
      });
      return res
        .status(400)
        .json({ error: 'Failed to decrypt access token', details: error.message });
    }

    // Sync queries from GitHub
    const result = await syncGitHubQueries({
      accessToken,
      owner: connection.owner,
      repo: connection.repo,
      branch: connection.branch,
      queryPath: connection.queryPath,
      includePatterns: connection.includePatterns,
      excludePatterns: connection.excludePatterns,
    });

    if (result.success) {
      // Store queries in cache for RAG (scoped to this GitHub connection)
      await storeGitHubQueriesInCache(userId, result.queries, id);

      // Update connection metadata
      await GitHubRepoConnection.findByIdAndUpdate(id, {
        lastSyncedAt: new Date(),
        lastSyncSuccess: true,
        syncError: null,
      });

      logger.info('[GitHub Connection] Synced queries from GitHub:', {
        userId,
        connectionId: id,
        queriesFound: result.queries.length,
        resultKeys: Object.keys(result),
        syncedCount: result.syncedCount,
      });
    } else {
      await GitHubRepoConnection.findByIdAndUpdate(id, {
        lastSyncSuccess: false,
        syncError: result.error,
      });
    }

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      queriesFound: result.queries.length,
      syncedCount: result.syncedCount,
      queries: result.queries,
      error: result.error,
      message: result.message,
    });
  } catch (error) {
    logger.error('Error syncing GitHub connection:', error);
    res.status(500).json({ error: 'Failed to sync GitHub connection' });
  }
});

/**
 * @route PUT /api/github-connections/:id
 * @desc Update a GitHub repo connection
 * @access Private
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const {
      name,
      branch,
      queryPath,
      includePatterns,
      excludePatterns,
      accessToken,
      isActive,
      connectionIds,
    } = req.body;

    let query;
    if (userOrgId) {
      query = { _id: id, isActive: true, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { _id: id, userId, isActive: true };
    }

    const connection = await GitHubRepoConnection.findOne(query);

    if (!connection) {
      return res.status(404).json({ error: 'GitHub connection not found' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (branch) updates.branch = branch;
    if (queryPath !== undefined) updates.queryPath = queryPath;
    if (includePatterns) updates.includePatterns = includePatterns;
    if (excludePatterns) updates.excludePatterns = excludePatterns;
    if (isActive !== undefined) updates.isActive = isActive;
    if (accessToken) updates.accessToken = encryptCredentials(accessToken);
    if (connectionIds !== undefined) {
      updates.connectionIds = connectionIds;
      // Invalidate cache when linked databases change
      clearGitHubQueriesCache(userId, id);
    }

    const updated = await GitHubRepoConnection.findByIdAndUpdate(id, updates, { new: true }).select(
      '-accessToken',
    );

    res.status(200).json(updated);
  } catch (error) {
    logger.error('Error updating GitHub connection:', error);
    res.status(500).json({ error: 'Failed to update GitHub connection' });
  }
});

/**
 * @route DELETE /api/github-connections/:id
 * @desc Delete a GitHub repo connection
 * @access Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    let query;
    if (userOrgId) {
      query = { _id: id, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { _id: id, userId };
    }

    const connection = await GitHubRepoConnection.findOne(query);

    if (!connection) {
      return res.status(404).json({ error: 'GitHub connection not found' });
    }

    // Soft delete
    await GitHubRepoConnection.findByIdAndUpdate(id, {
      isActive: false,
    });

    // Clear cache for this specific GitHub connection
    clearGitHubQueriesCache(userId, id);

    logger.info('[GitHub Connection] Deleted GitHub repo connection:', {
      userId,
      connectionId: id,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error deleting GitHub connection:', error);
    res.status(500).json({ error: 'Failed to delete GitHub connection' });
  }
});

module.exports = router;
