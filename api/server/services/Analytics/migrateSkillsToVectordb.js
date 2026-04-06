const mongoose = require('mongoose');
const { Skill } = require('~/db/models');
const vectordbService = require('./vectordbService');
const { generateEmbedding } = require('./skillMatching');
const { logger } = require('@librechat/data-schemas');

/**
 * Migration script to migrate existing skill embeddings from MongoDB to Vectordb
 * Run this once to set up vectordb and migrate existing data
 */

/**
 * Generate embedding for a skill if it doesn't exist
 * @param {Object} skill - Skill document
 * @returns {Promise<number[]>} Embedding vector
 */
async function getOrGenerateEmbedding(skill) {
  // Check if embedding exists and is recent (within 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (
    skill.embedding &&
    skill.embedding.length > 0 &&
    skill.embeddingUpdatedAt &&
    skill.embeddingUpdatedAt > thirtyDaysAgo
  ) {
    return skill.embedding;
  }

  // Generate new embedding
  const textForEmbedding = [
    skill.title || '',
    skill.description || '',
    skill.content || '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const embedding = await generateEmbedding(textForEmbedding);

  // Update skill in MongoDB with new embedding
  await Skill.findByIdAndUpdate(skill._id, {
    embedding,
    embeddingUpdatedAt: new Date(),
  });

  return embedding;
}

/**
 * Migrate a single skill to vectordb
 * @param {Object} skill - Skill document
 * @returns {Promise<void>}
 */
async function migrateSkill(skill) {
  try {
    const embedding = await getOrGenerateEmbedding(skill);

    await vectordbService.upsertSkillEmbedding({
      skillId: skill.skillId,
      userId: skill.userId.toString(),
      title: skill.title,
      description: skill.description,
      content: skill.content,
      embedding,
      isActive: skill.isActive !== false,
    });

    logger.debug('[Migration] Skill migrated to vectordb', {
      skillId: skill.skillId,
      userId: skill.userId,
    });
  } catch (error) {
    logger.error('[Migration] Error migrating skill:', {
      skillId: skill.skillId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Migrate all skills from MongoDB to vectordb
 * @param {Object} options - Migration options
 * @param {boolean} options.dryRun - If true, don't actually migrate, just report
 * @param {string} [options.userId] - If provided, only migrate skills for this user
 * @returns {Promise<Object>} Migration statistics
 */
async function migrateAllSkills(options = {}) {
  const { dryRun = false, userId = null } = options;

  logger.info('[Migration] Starting skill migration to vectordb', {
    dryRun,
    userId: userId || 'all users',
  });

  // Check vectordb availability
  const isAvailable = await vectordbService.checkAvailability();
  if (!isAvailable) {
    throw new Error('Vectordb is not available. Please check your configuration.');
  }

  // Initialize schema if not already done
  if (!dryRun) {
    await vectordbService.initializeSchema();
  }

  // Build query
  const query = userId ? { userId } : {};

  // Get all skills
  const skills = await Skill.find(query).select('+embedding');
  const totalSkills = skills.length;

  logger.info('[Migration] Found skills to migrate', { count: totalSkills });

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  // Process skills in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < skills.length; i += batchSize) {
    const batch = skills.slice(i, i + batchSize);
    logger.info('[Migration] Processing batch', {
      batch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(totalSkills / batchSize),
      current: i + 1,
      total: totalSkills,
    });

    await Promise.all(
      batch.map(async (skill) => {
        try {
          if (!dryRun) {
            await migrateSkill(skill);
          }
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push({
            skillId: skill.skillId,
            error: error.message,
          });
        }
      }),
    );

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < skills.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const stats = {
    total: totalSkills,
    success: successCount,
    errors: errorCount,
    errorDetails: errors,
  };

  logger.info('[Migration] Migration completed', stats);

  return stats;
}

/**
 * Sync a single skill to vectordb (for real-time updates)
 * @param {Object} skill - Skill document
 * @returns {Promise<void>}
 */
async function syncSkillToVectordb(skill) {
  try {
    const isAvailable = await vectordbService.checkAvailability();
    if (!isAvailable) {
      logger.warn('[Sync] Vectordb not available, skipping sync');
      return;
    }

    // Get or generate embedding
    const embedding = await getOrGenerateEmbedding(skill);

    // Upsert to vectordb
    await vectordbService.upsertSkillEmbedding({
      skillId: skill.skillId,
      userId: skill.userId.toString(),
      title: skill.title,
      description: skill.description,
      content: skill.content,
      embedding,
      isActive: skill.isActive !== false,
    });

    logger.debug('[Sync] Skill synced to vectordb', {
      skillId: skill.skillId,
    });
  } catch (error) {
    logger.error('[Sync] Error syncing skill to vectordb:', {
      skillId: skill.skillId,
      error: error.message,
    });
    // Don't throw - we don't want to break the main flow if sync fails
  }
}

/**
 * Delete a skill from vectordb
 * @param {string} skillId - Skill ID
 * @returns {Promise<void>}
 */
async function deleteSkillFromVectordb(skillId) {
  try {
    const isAvailable = await vectordbService.checkAvailability();
    if (!isAvailable) {
      logger.warn('[Sync] Vectordb not available, skipping delete');
      return;
    }

    await vectordbService.deleteSkillEmbedding(skillId);
    logger.debug('[Sync] Skill deleted from vectordb', { skillId });
  } catch (error) {
    logger.error('[Sync] Error deleting skill from vectordb:', {
      skillId,
      error: error.message,
    });
  }
}

// If run directly, execute migration
if (require.main === module) {
  (async () => {
    try {
      // Connect to MongoDB
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/LibreChat';
      await mongoose.connect(mongoUri);
      logger.info('[Migration] Connected to MongoDB');

      // Parse command line arguments
      const args = process.argv.slice(2);
      const dryRun = args.includes('--dry-run');
      const userIdArg = args.find((arg) => arg.startsWith('--user-id='));
      const userId = userIdArg ? userIdArg.split('=')[1] : null;

      // Run migration
      const stats = await migrateAllSkills({ dryRun, userId });

      console.log('\n=== Migration Statistics ===');
      console.log(`Total skills: ${stats.total}`);
      console.log(`Success: ${stats.success}`);
      console.log(`Errors: ${stats.errors}`);
      if (stats.errorDetails.length > 0) {
        console.log('\nErrors:');
        stats.errorDetails.forEach((err) => {
          console.log(`  - ${err.skillId}: ${err.error}`);
        });
      }

      await mongoose.disconnect();
      await vectordbService.closePool();
      process.exit(0);
    } catch (error) {
      logger.error('[Migration] Migration failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  migrateAllSkills,
  migrateSkill,
  syncSkillToVectordb,
  deleteSkillFromVectordb,
};

