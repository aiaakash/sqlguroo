const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { SavedQuery } = require('~/db/models');
const { getUserOrgMembership } = require('~/server/services/OrganizationService');

const router = express.Router();

// All routes require authentication
router.use(requireJwtAuth);

/**
 * @route GET /api/saved-queries
 * @desc Get all saved queries for the authenticated user with pagination and search
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    // Parse pagination params
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Parse search param
    const search = req.query.search?.trim();

    // Parse sort params
    const sortBy = req.query.sortBy || 'createdAt';
    const sortDirection = req.query.sortDirection === 'asc' ? 1 : -1;

    // Build query - personal + org-scoped
    let query;
    if (userOrgId) {
      query = { $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { userId };
    }

    // Add search filter if provided
    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortDirection;

    // Execute query with pagination
    const [queries, total] = await Promise.all([
      SavedQuery.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      SavedQuery.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      queries,
      total,
      page,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error('[savedQueries] Error fetching saved queries:', error);
    res.status(500).json({ error: 'Error fetching saved queries' });
  }
});

/**
 * @route GET /api/saved-queries/all
 * @desc Get all saved queries for the authenticated user (for dropdown/mentions)
 * @access Private
 */
router.get('/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;

    let query;
    if (userOrgId) {
      query = { $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { userId };
    }

    const queries = await SavedQuery.find(query)
      .sort({ name: 1 })
      .select('_id name sqlContent')
      .lean();

    res.status(200).json(queries);
  } catch (error) {
    logger.error('[savedQueries] Error fetching all saved queries:', error);
    res.status(500).json({ error: 'Error fetching saved queries' });
  }
});

/**
 * @route GET /api/saved-queries/:id
 * @desc Get a single saved query by ID
 * @access Private
 */
router.get('/:id', async (req, res) => {
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

    const savedQuery = await SavedQuery.findOne(query).lean();

    if (!savedQuery) {
      return res.status(404).json({ error: 'Saved query not found' });
    }

    res.status(200).json(savedQuery);
  } catch (error) {
    logger.error('[savedQueries] Error fetching saved query:', error);
    res.status(500).json({ error: 'Error fetching saved query' });
  }
});

/**
 * @route POST /api/saved-queries
 * @desc Create a new saved query
 * @access Private
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { name, sqlContent, description, conversationId, messageId, connectionId, tags } =
      req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Query name is required' });
    }

    if (!sqlContent || !sqlContent.trim()) {
      return res.status(400).json({ error: 'SQL content is required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Query name cannot exceed 100 characters' });
    }

    const savedQuery = await SavedQuery.create({
      userId,
      name: name.trim(),
      sqlContent: sqlContent.trim(),
      description: description?.trim(),
      conversationId,
      messageId,
      connectionId,
      tags: tags || [],
      organizationId: userOrgId || undefined,
    });

    res.status(201).json(savedQuery);
  } catch (error) {
    logger.error('[savedQueries] Error creating saved query:', error);
    res.status(500).json({ error: 'Error creating saved query' });
  }
});

/**
 * @route PATCH /api/saved-queries/:id
 * @desc Update a saved query
 * @access Private
 */
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const membership = await getUserOrgMembership(userId);
    const userOrgId = membership ? (membership.organizationId._id || membership.organizationId) : null;
    const { name, sqlContent, description, tags } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Query name cannot be empty' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'Query name cannot exceed 100 characters' });
      }
      updateData.name = name.trim();
    }
    if (sqlContent !== undefined) {
      if (!sqlContent.trim()) {
        return res.status(400).json({ error: 'SQL content cannot be empty' });
      }
      updateData.sqlContent = sqlContent.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim();
    }
    if (tags !== undefined) {
      updateData.tags = tags;
    }

    let query;
    if (userOrgId) {
      query = { _id: id, $or: [{ userId }, { organizationId: userOrgId }] };
    } else {
      query = { _id: id, userId };
    }

    const savedQuery = await SavedQuery.findOneAndUpdate(
      query,
      updateData,
      { new: true },
    ).lean();

    if (!savedQuery) {
      return res.status(404).json({ error: 'Saved query not found' });
    }

    res.status(200).json(savedQuery);
  } catch (error) {
    logger.error('[savedQueries] Error updating saved query:', error);
    res.status(500).json({ error: 'Error updating saved query' });
  }
});

/**
 * @route DELETE /api/saved-queries/:id
 * @desc Delete a saved query
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

    const result = await SavedQuery.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Saved query not found' });
    }

    res.status(200).json({ message: 'Saved query deleted successfully' });
  } catch (error) {
    logger.error('[savedQueries] Error deleting saved query:', error);
    res.status(500).json({ error: 'Error deleting saved query' });
  }
});

module.exports = router;
