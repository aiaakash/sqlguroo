const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { Skill } = require('~/db/models');
const {
  syncSkillToVectordb,
  deleteSkillFromVectordb,
} = require('~/server/services/Analytics/migrateSkillsToVectordb');

const router = express.Router();

/**
 * @route GET /api/analytics/skills
 * @desc Get all skills for the current user
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const { isActive } = req.query;

    // Base query: only return skills created by the current user
    let query = { userId: req.user.id };

    // Filter by active status if provided
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const skills = await Skill.find(query)
      .select('-embedding') // Don't include embeddings in list
      .sort({ createdAt: -1 }); // Sort by creation date, newest first

    res.status(200).json(skills);
  } catch (error) {
    logger.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Error fetching skills' });
  }
});

/**
 * @route GET /api/analytics/skills/:id
 * @desc Get a specific skill
 * @access Private
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const skill = await Skill.findOne({ skillId: id, userId: req.user.id }).select('-embedding');

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.status(200).json(skill);
  } catch (error) {
    logger.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Error fetching skill' });
  }
});

/**
 * @route POST /api/analytics/skills
 * @desc Create a new skill
 * @access Private
 */
router.post('/', async (req, res) => {
  try {
    const { title, description, content, isActive = true } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.length > 100) {
      return res.status(400).json({ error: 'Title cannot exceed 100 characters' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: 'Description cannot exceed 500 characters' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const skill = await Skill.create({
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      userId: req.user.id,
      isActive: Boolean(isActive),
    });

    // Sync to vectordb (async, don't wait)
    syncSkillToVectordb(skill).catch((err) => {
      logger.warn('[Skills Route] Failed to sync skill to vectordb:', err);
    });

    // Return skill without embedding
    const skillObj = skill.toObject();
    delete skillObj.embedding;

    res.status(201).json(skillObj);
  } catch (error) {
    logger.error('Error creating skill:', error);
    if (error.code === 11000) {
      // Duplicate key error (skillId collision - very rare with nanoid)
      return res.status(409).json({ error: 'Skill ID collision, please try again' });
    }
    res.status(500).json({ error: 'Error creating skill' });
  }
});

/**
 * @route PUT /api/analytics/skills/:id
 * @desc Update a skill
 * @access Private
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, content, isActive } = req.body;

    const skill = await Skill.findOne({ skillId: id, userId: req.user.id });

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Update fields if provided
    const updateData = {};
    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      if (title.length > 100) {
        return res.status(400).json({ error: 'Title cannot exceed 100 characters' });
      }
      updateData.title = title.trim();
      // Clear embedding when title changes (will be recomputed on next use)
      updateData.embedding = undefined;
      updateData.embeddingUpdatedAt = undefined;
    }

    if (description !== undefined) {
      if (!description.trim()) {
        return res.status(400).json({ error: 'Description cannot be empty' });
      }
      if (description.length > 500) {
        return res.status(400).json({ error: 'Description cannot exceed 500 characters' });
      }
      updateData.description = description.trim();
      // Clear embedding when description changes (will be recomputed on next use)
      updateData.embedding = undefined;
      updateData.embeddingUpdatedAt = undefined;
    }

    if (content !== undefined) {
      if (!content.trim()) {
        return res.status(400).json({ error: 'Content cannot be empty' });
      }
      updateData.content = content.trim();
      // Clear embedding when content changes (will be recomputed on next use)
      updateData.embedding = undefined;
      updateData.embeddingUpdatedAt = undefined;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    Object.assign(skill, updateData);
    await skill.save();

    // Sync to vectordb (async, don't wait)
    // If content/description changed, embedding will be regenerated
    syncSkillToVectordb(skill).catch((err) => {
      logger.warn('[Skills Route] Failed to sync skill to vectordb:', err);
    });

    // Return skill without embedding
    const skillObj = skill.toObject();
    delete skillObj.embedding;

    res.status(200).json(skillObj);
  } catch (error) {
    logger.error('Error updating skill:', error);
    res.status(500).json({ error: 'Error updating skill' });
  }
});

/**
 * @route DELETE /api/analytics/skills/:id
 * @desc Delete a skill
 * @access Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const skill = await Skill.findOneAndDelete({ skillId: id, userId: req.user.id });

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Delete from vectordb (async, don't wait)
    deleteSkillFromVectordb(skill.skillId).catch((err) => {
      logger.warn('[Skills Route] Failed to delete skill from vectordb:', err);
    });

    res.status(200).json({ message: 'Skill deleted successfully' });
  } catch (error) {
    logger.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Error deleting skill' });
  }
});

module.exports = router;

