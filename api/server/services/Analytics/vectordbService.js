const { Pool } = require('pg');
const { logger } = require('@librechat/data-schemas');

/**
 * Vectordb Service for Skill Embeddings
 * Manages skill embeddings in PostgreSQL with pgvector extension
 */

let pool = null;

/**
 * Get or create PostgreSQL connection pool for vectordb
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    const config = {
      host: process.env.VECTORDB_HOST || 'vectordb',
      port: parseInt(process.env.VECTORDB_PORT || '5432', 10),
      database: process.env.VECTORDB_DB || 'mydatabase',
      user: process.env.VECTORDB_USER || 'myuser',
      password: process.env.VECTORDB_PASSWORD || 'mypassword',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('[Vectordb Service] Pool error:', err);
    });
  }

  return pool;
}

/**
 * Initialize the skill_embeddings table and indexes
 * This should be called once during setup/migration
 * @returns {Promise<void>}
 */
async function initializeSchema() {
  const pool = getPool();
  
  try {
    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    logger.info('[Vectordb Service] pgvector extension enabled');

    // Get embedding dimension from env or default to 1536 (openai/text-embedding-3-small)
    const embeddingDimension = parseInt(
      process.env.ANALYTICS_EMBEDDING_DIMENSION || '1536',
      10,
    );

    // Create skill_embeddings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skill_embeddings (
        id SERIAL PRIMARY KEY,
        skill_id VARCHAR(255) NOT NULL UNIQUE,
        user_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content TEXT,
        embedding vector(${embeddingDimension}),
        is_active BOOLEAN DEFAULT true,
        embedding_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_skill_id UNIQUE (skill_id)
      );
    `);
    logger.info('[Vectordb Service] skill_embeddings table created');

    // Create indexes for efficient queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_embeddings_user_active 
      ON skill_embeddings(user_id, is_active) 
      WHERE is_active = true;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_embeddings_user_id 
      ON skill_embeddings(user_id);
    `);

    // Create HNSW index for fast similarity search
    // This is the key index for vector similarity queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_embeddings_embedding_hnsw 
      ON skill_embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    logger.info('[Vectordb Service] HNSW index created for similarity search');

    logger.info('[Vectordb Service] Schema initialization completed');
  } catch (error) {
    logger.error('[Vectordb Service] Error initializing schema:', error);
    throw error;
  }
}

/**
 * Upsert a skill embedding in vectordb
 * @param {Object} skillData - Skill data
 * @param {string} skillData.skillId - Skill ID
 * @param {string} skillData.userId - User ID
 * @param {string} skillData.title - Skill title
 * @param {string} [skillData.description] - Skill description
 * @param {string} [skillData.content] - Skill content
 * @param {number[]} skillData.embedding - Embedding vector
 * @param {boolean} [skillData.isActive] - Whether skill is active
 * @returns {Promise<void>}
 */
async function upsertSkillEmbedding(skillData) {
  const pool = getPool();
  const {
    skillId,
    userId,
    title,
    description,
    content,
    embedding,
    isActive = true,
  } = skillData;

  if (!skillId || !userId || !title || !embedding || !Array.isArray(embedding)) {
    throw new Error('Missing required fields: skillId, userId, title, and embedding array are required');
  }

  try {
    // Convert embedding array to PostgreSQL vector format
    const embeddingStr = `[${embedding.join(',')}]`;

    await pool.query(
      `INSERT INTO skill_embeddings 
       (skill_id, user_id, title, description, content, embedding, is_active, embedding_updated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (skill_id) 
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         is_active = EXCLUDED.is_active,
         embedding_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP;`,
      [skillId, userId, title, description || null, content || null, embeddingStr, isActive],
    );

    logger.debug('[Vectordb Service] Skill embedding upserted', {
      skillId,
      userId,
      embeddingLength: embedding.length,
    });
  } catch (error) {
    logger.error('[Vectordb Service] Error upserting skill embedding:', error);
    throw error;
  }
}

/**
 * Find relevant skills using vector similarity search
 * @param {string} userId - User ID
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} topK - Number of top skills to return (default: 3)
 * @param {number} threshold - Minimum similarity threshold (default: 0.4)
 * @returns {Promise<Array>} Array of skills with relevance scores
 */
async function findRelevantSkillsByEmbedding(userId, queryEmbedding, topK = 3, threshold = 0.4) {
  const pool = getPool();

  if (!userId || !queryEmbedding || !Array.isArray(queryEmbedding)) {
    throw new Error('userId and queryEmbedding array are required');
  }

  try {
    // Convert embedding array to PostgreSQL vector format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Use cosine distance (<=>) for similarity search
    // Cosine similarity = 1 - cosine distance
    // We filter by similarity >= threshold, which means distance <= (1 - threshold)
    const distanceThreshold = 1 - threshold;

    const result = await pool.query(
      `SELECT 
        skill_id,
        title,
        description,
        content,
        is_active,
        embedding_updated_at,
        -- Calculate similarity: 1 - cosine_distance
        1 - (embedding <=> $1::vector) as similarity
      FROM skill_embeddings
      WHERE user_id = $2 
        AND is_active = true
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> $1::vector)) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4;`,
      [embeddingStr, userId, threshold, topK],
    );

    const skills = result.rows.map((row) => ({
      skillId: row.skill_id,
      title: row.title,
      description: row.description,
      content: row.content,
      isActive: row.is_active,
      embeddingUpdatedAt: row.embedding_updated_at,
      relevanceScore: parseFloat(row.similarity),
    }));

    logger.debug('[Vectordb Service] Found relevant skills', {
      userId,
      found: skills.length,
      topK,
      threshold,
    });

    return skills;
  } catch (error) {
    // Check if this is a dimension mismatch error
    if (error.message && error.message.includes('different vector dimensions')) {
      logger.warn('[Vectordb Service] Vector dimension mismatch - embeddings need to be regenerated:', {
        error: error.message,
      });
      // Return empty array to trigger fallback to in-memory search
      // which will regenerate embeddings with correct dimension
      return [];
    }
    logger.error('[Vectordb Service] Error finding relevant skills:', error);
    throw error;
  }
}

/**
 * Delete a skill embedding from vectordb
 * @param {string} skillId - Skill ID
 * @returns {Promise<void>}
 */
async function deleteSkillEmbedding(skillId) {
  const pool = getPool();

  try {
    await pool.query('DELETE FROM skill_embeddings WHERE skill_id = $1;', [skillId]);
    logger.debug('[Vectordb Service] Skill embedding deleted', { skillId });
  } catch (error) {
    logger.error('[Vectordb Service] Error deleting skill embedding:', error);
    throw error;
  }
}

/**
 * Update skill active status in vectordb
 * @param {string} skillId - Skill ID
 * @param {boolean} isActive - Active status
 * @returns {Promise<void>}
 */
async function updateSkillActiveStatus(skillId, isActive) {
  const pool = getPool();

  try {
    await pool.query(
      'UPDATE skill_embeddings SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE skill_id = $2;',
      [isActive, skillId],
    );
    logger.debug('[Vectordb Service] Skill active status updated', { skillId, isActive });
  } catch (error) {
    logger.error('[Vectordb Service] Error updating skill active status:', error);
    throw error;
  }
}

/**
 * Get skill count for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of skills
 */
async function getSkillCount(userId) {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM skill_embeddings WHERE user_id = $1 AND is_active = true;',
      [userId],
    );
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('[Vectordb Service] Error getting skill count:', error);
    throw 0;
  }
}

/**
 * Check if vectordb is available and properly configured
 * @returns {Promise<boolean>} True if vectordb is available
 */
async function checkAvailability() {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1 as test;');
    return result.rows.length > 0;
  } catch (error) {
    logger.warn('[Vectordb Service] Vectordb not available:', error.message);
    return false;
  }
}

/**
 * Close the connection pool
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('[Vectordb Service] Connection pool closed');
  }
}

module.exports = {
  initializeSchema,
  upsertSkillEmbedding,
  findRelevantSkillsByEmbedding,
  deleteSkillEmbedding,
  updateSkillActiveStatus,
  getSkillCount,
  checkAvailability,
  closePool,
  getPool, // Exported for testing/migration scripts
};

