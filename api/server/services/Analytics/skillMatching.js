const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const { Skill } = require('~/db/models');
const vectordbService = require('./vectordbService');

// Initialize OpenRouter client for embeddings (uses OpenAI-compatible API)
// Qwen/Qwen3-embedding-8b is the default embedding model
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Embedding model - use environment variable or default to Qwen/Qwen3-embedding-8b
const EMBEDDING_MODEL = process.env.ANALYTICS_EMBEDDING_MODEL || 'openai/text-embedding-3-small';

// Expected embedding dimension - must match the model's output dimension
const EXPECTED_EMBEDDING_DIMENSION = parseInt(
  process.env.ANALYTICS_EMBEDDING_DIMENSION || '4096',
  10,
);

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity score (0-1)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Generate embedding for a text using OpenRouter
 * Default model: qwen/qwen3-embedding-8b
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbedding(text) {
  try {
    console.log('[Skill Matching] Generating embedding:', {
      provider: 'OpenRouter',
      model: EMBEDDING_MODEL,
      textLength: text?.length || 0,
      textPreview: text?.substring(0, 100) || '',
    });
    logger.debug(
      `[Skill Matching] Generating embedding using OpenRouter with model: ${EMBEDDING_MODEL}`,
      {
        textLength: text?.length || 0,
      },
    );

    const response = await openRouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
    });

    console.log('[Skill Matching] Embedding generated successfully:', {
      provider: 'OpenRouter',
      model: EMBEDDING_MODEL,
      embeddingLength: response.data[0].embedding.length,
      embeddingPreview: response.data[0].embedding.slice(0, 5),
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[Skill Matching] Error generating embedding:', {
      error: error.message,
      errorCode: error.code,
      errorStatus: error.status,
      model: EMBEDDING_MODEL,
    });
    logger.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Get or compute embedding for a skill
 * @param {Object} skill - Skill document
 * @returns {Promise<number[]>} Embedding vector
 */
async function getSkillEmbedding(skill) {
  // Check if embedding exists and is recent (within 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Check if embedding dimension matches the current model
  const hasCorrectDimension =
    skill.embedding && skill.embedding.length === EXPECTED_EMBEDDING_DIMENSION;

  if (
    skill.embedding &&
    skill.embedding.length > 0 &&
    skill.embeddingUpdatedAt &&
    skill.embeddingUpdatedAt > thirtyDaysAgo &&
    hasCorrectDimension
  ) {
    console.log('[Skill Matching] Using cached embedding for skill:', {
      skillId: skill.skillId,
      title: skill.title,
      embeddingLength: skill.embedding.length,
      embeddingUpdatedAt: skill.embeddingUpdatedAt,
    });
    return skill.embedding;
  }

  // If dimension doesn't match, log that we're regenerating
  if (skill.embedding && skill.embedding.length > 0 && !hasCorrectDimension) {
    console.log('[Skill Matching] Embedding dimension mismatch, regenerating:', {
      skillId: skill.skillId,
      title: skill.title,
      oldDimension: skill.embedding.length,
      expectedDimension: EXPECTED_EMBEDDING_DIMENSION,
    });
  }

  // Generate new embedding using title + description + content for better semantic matching
  // This captures keywords from title, context from description, and SQL patterns from content
  const textForEmbedding = [skill.title || '', skill.description || '', skill.content || '']
    .filter(Boolean)
    .join('\n\n');

  console.log('[Skill Matching] Generating new embedding for skill:', {
    skillId: skill.skillId,
    title: skill.title,
    description: skill.description?.substring(0, 100),
    contentPreview: skill.content?.substring(0, 100),
    textForEmbeddingLength: textForEmbedding.length,
  });
  logger.debug('[Skill Matching] Generating embedding for skill', {
    skillId: skill.skillId,
    title: skill.title,
    textLength: textForEmbedding.length,
  });

  const embedding = await generateEmbedding(textForEmbedding);

  console.log('[Skill Matching] Skill embedding generated:', {
    skillId: skill.skillId,
    title: skill.title,
    embeddingLength: embedding.length,
  });

  // Update skill with new embedding (don't await to avoid blocking)
  Skill.findByIdAndUpdate(skill._id, {
    embedding,
    embeddingUpdatedAt: new Date(),
  }).catch((err) => {
    logger.error('Error updating skill embedding:', err);
  });

  // Also update vectordb if enabled (don't await to avoid blocking)
  if (process.env.USE_VECTORDB_FOR_SKILLS !== 'false') {
    vectordbService
      .upsertSkillEmbedding({
        skillId: skill.skillId,
        userId: skill.userId?.toString ? skill.userId.toString() : skill.userId,
        title: skill.title,
        description: skill.description,
        content: skill.content,
        embedding,
        isActive: skill.isActive ?? true,
      })
      .catch((err) => {
        logger.error('Error updating skill embedding in vectordb:', err);
      });
  }

  return embedding;
}

/**
 * Find relevant skills using vectordb (fast path)
 * @param {string} userIdStr - User ID as string
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} topK - Number of top skills to return
 * @param {number} threshold - Minimum similarity threshold
 * @returns {Promise<Array>} Array of skills with relevance scores
 */
async function findRelevantSkillsVectordb(userIdStr, queryEmbedding, topK, threshold) {
  try {
    // Use vectordb for fast similarity search
    const vectordbSkills = await vectordbService.findRelevantSkillsByEmbedding(
      userIdStr,
      queryEmbedding,
      topK,
      threshold,
    );

    // Fetch full skill documents from MongoDB for complete data
    if (vectordbSkills.length > 0) {
      const skillIds = vectordbSkills.map((s) => s.skillId);
      const mongoSkills = await Skill.find({
        skillId: { $in: skillIds },
        userId: userIdStr,
      });

      // Merge vectordb results with MongoDB data
      const skillMap = new Map(mongoSkills.map((s) => [s.skillId, s.toObject()]));

      const relevantSkills = vectordbSkills
        .map((vectordbSkill) => {
          const mongoSkill = skillMap.get(vectordbSkill.skillId);
          if (!mongoSkill) {
            return null;
          }

          return {
            ...mongoSkill,
            relevanceScore: vectordbSkill.relevanceScore,
            embedding: undefined, // Remove embedding from response
          };
        })
        .filter(Boolean);

      return relevantSkills;
    }

    return [];
  } catch (error) {
    logger.warn(
      '[Skill Matching] Vectordb search failed, falling back to in-memory:',
      error.message,
    );
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * Find relevant skills using in-memory calculation (fallback)
 * @param {string} userIdStr - User ID as string
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} topK - Number of top skills to return
 * @param {number} threshold - Minimum similarity threshold
 * @returns {Promise<Array>} Array of skills with relevance scores
 */
async function findRelevantSkillsInMemory(userIdStr, queryEmbedding, topK, threshold) {
  // Get all active skills for the user
  const skills = await Skill.find({ userId: userIdStr, isActive: true }).select('+embedding');

  if (skills.length === 0) {
    return [];
  }

  // Compute similarity scores for all skills
  const skillsWithScores = await Promise.all(
    skills.map(async (skill) => {
      const skillEmbedding = await getSkillEmbedding(skill);
      const similarity = cosineSimilarity(queryEmbedding, skillEmbedding);

      return {
        skill: skill.toObject(),
        relevanceScore: similarity,
      };
    }),
  );

  // Filter by threshold and sort by relevance
  const relevantSkills = skillsWithScores
    .filter((item) => item.relevanceScore >= threshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK)
    .map((item) => ({
      ...item.skill,
      relevanceScore: item.relevanceScore,
      embedding: undefined, // Remove embedding from response
    }));

  return relevantSkills;
}

/**
 * Find relevant skills for a user query using semantic matching
 * Uses vectordb if available, falls back to in-memory calculation
 * @param {string} userId - User ID
 * @param {string} query - User's natural language query
 * @param {number} topK - Number of top skills to return (default: 3)
 * @param {number} threshold - Minimum similarity threshold (default: 0.4, lowered from 0.7 for better matching)
 * @returns {Promise<Array>} Array of skills with relevance scores
 */
async function findRelevantSkills(
  userId,
  query,
  topK = 3,
  threshold = 0.4,
  preGeneratedEmbedding = null,
) {
  try {
    // Convert userId to string if it's an ObjectId
    const userIdStr = userId?.toString ? userId.toString() : userId;

    console.log('[Skill Matching] Starting skill matching:', {
      userId: userIdStr,
      query: query?.substring(0, 100),
      queryLength: query?.length || 0,
      topK,
      threshold,
    });
    logger.info('[Skill Matching] Finding relevant skills', {
      userId: userIdStr,
      queryLength: query?.length || 0,
      topK,
      threshold,
    });

    // Use pre-generated embedding or generate a new one
    let queryEmbedding = preGeneratedEmbedding;
    if (!queryEmbedding) {
      console.log('[Skill Matching] Generating embedding for user query...');
      logger.debug('[Skill Matching] Generating query embedding');
      queryEmbedding = await generateEmbedding(query);
      console.log('[Skill Matching] Query embedding generated:', {
        embeddingLength: queryEmbedding.length,
        embeddingPreview: queryEmbedding.slice(0, 5),
      });
    } else {
      console.log('[Skill Matching] Using pre-generated embedding:', {
        embeddingLength: queryEmbedding.length,
        embeddingPreview: queryEmbedding.slice(0, 5),
      });
    }

    // Try vectordb first (if enabled and available)
    const useVectordb = process.env.USE_VECTORDB_FOR_SKILLS !== 'false'; // Default to true
    let relevantSkills = [];
    let usedVectordb = false;

    if (useVectordb) {
      try {
        const isAvailable = await vectordbService.checkAvailability();
        if (isAvailable) {
          console.log('[Skill Matching] Using vectordb for similarity search');
          relevantSkills = await findRelevantSkillsVectordb(
            userIdStr,
            queryEmbedding,
            topK,
            threshold,
          );
          // If vectordb returned no results (possibly due to dimension mismatch),
          // fall back to in-memory search to regenerate embeddings
          if (relevantSkills.length === 0) {
            console.log('[Skill Matching] Vectordb returned no results, falling back to in-memory');
          } else {
            usedVectordb = true;
          }
        } else {
          console.log('[Skill Matching] Vectordb not available, using in-memory calculation');
        }
      } catch (error) {
        console.log(
          '[Skill Matching] Vectordb search failed, falling back to in-memory:',
          error.message,
        );
        logger.warn('[Skill Matching] Vectordb search failed, using fallback:', error.message);
      }
    }

    // Fallback to in-memory calculation if vectordb not used
    if (!usedVectordb) {
      console.log('[Skill Matching] Using in-memory similarity calculation');
      relevantSkills = await findRelevantSkillsInMemory(userIdStr, queryEmbedding, topK, threshold);
    }

    console.log('[Skill Matching] Final relevant skills selected:', {
      usedVectordb,
      selectedCount: relevantSkills.length,
      selectedSkills: relevantSkills.map((s) => ({
        skillId: s.skillId,
        title: s.title,
        relevanceScore: s.relevanceScore?.toFixed(4),
      })),
    });

    logger.info(`[Skill Matching] Found ${relevantSkills.length} relevant skills for query`, {
      userId,
      queryLength: query.length,
      relevantCount: relevantSkills.length,
      usedVectordb,
      selectedSkills: relevantSkills.map((s) => ({
        skillId: s.skillId,
        title: s.title,
        relevanceScore: s.relevanceScore,
      })),
    });

    return relevantSkills;
  } catch (error) {
    logger.error('Error finding relevant skills:', error);
    // Return empty array on error to not break the query flow
    return [];
  }
}

/**
 * Format skills for injection into prompt
 * @param {Array} skills - Array of skills with relevance scores
 * @returns {string} Formatted skills context string
 */
function formatSkillsForPrompt(skills) {
  if (!skills || skills.length === 0) {
    return '';
  }

  const skillsText = skills
    .map(
      (skill) => `Skill: "${skill.title}" - ${skill.description}
Content: ${skill.content}`,
    )
    .join('\n\n');

  const formatted = `Context from Skills:
${skillsText}`;

  console.log('[Skill Matching] Formatted skills for prompt:', {
    skillsCount: skills.length,
    formattedLength: formatted.length,
    formattedPreview: formatted.substring(0, 300),
    skillTitles: skills.map((s) => s.title),
  });

  return formatted;
}

module.exports = {
  findRelevantSkills,
  formatSkillsForPrompt,
  generateEmbedding,
  cosineSimilarity,
};
