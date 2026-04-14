/**
 * GitHub Query RAG Service
 * Provides RAG-based retrieval for SQL queries stored in GitHub repositories
 */

const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const { GitHubRepoConnection } = require('~/db/models');

// Initialize OpenRouter client for embeddings (uses OpenAI-compatible API)
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Embedding model - use environment variable or default to Qwen/Qwen3-embedding-8b
const EMBEDDING_MODEL = process.env.ANALYTICS_EMBEDDING_MODEL || 'openai/text-embedding-3-small';

// In-memory cache for GitHub queries (keyed by `${userId}:${githubConnectionId}`)
const githubQueriesCache = new Map();

/**
 * Compute cosine similarity between two vectors
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
 */
async function generateEmbedding(text) {
  try {
    const response = await openRouter.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('[GitHub Query RAG] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Store GitHub queries in cache with embeddings
 * @param {string} userId - User ID
 * @param {Array} queries - Array of query objects
 * @param {string} githubConnectionId - GitHub connection ID (MongoDB ObjectId)
 */
async function storeGitHubQueriesInCache(userId, queries, githubConnectionId = null) {
  if (!queries || queries.length === 0) {
    console.log('[GitHub Query RAG] No queries to cache');
    return;
  }

  // Use composite key if githubConnectionId provided, otherwise fall back to userId-only key
  const cacheKey = githubConnectionId ? `${userId}:${githubConnectionId}` : userId;

  console.log('[GitHub Query RAG] Storing queries in cache:', {
    userId,
    githubConnectionId,
    cacheKey,
    queryCount: queries.length,
  });

  // Generate embeddings for each query
  const queriesWithEmbeddings = await Promise.all(
    queries.map(async (query) => {
      const textForEmbedding = [query.name || '', query.description || '', query.sqlContent || '']
        .filter(Boolean)
        .join('\n\n');

      try {
        const embedding = await generateEmbedding(textForEmbedding);
        return {
          ...query,
          embedding,
          textForEmbedding,
        };
      } catch (error) {
        console.warn('[GitHub Query RAG] Failed to generate embedding for query:', query.name);
        return null;
      }
    }),
  );

  // Filter out failed embeddings and store in cache
  const validQueries = queriesWithEmbeddings.filter(Boolean);
  githubQueriesCache.set(cacheKey, {
    queries: validQueries,
    storedAt: new Date(),
  });

  console.log('[GitHub Query RAG] Stored queries in cache:', {
    cacheKey,
    queryCount: validQueries.length,
  });
}

/**
 * Get cached GitHub queries for a specific GitHub connection
 * @param {string} userId - User ID
 * @param {string} githubConnectionId - GitHub connection ID (optional, uses composite key if provided)
 */
function getCachedGitHubQueries(userId, githubConnectionId = null) {
  const cacheKey = githubConnectionId ? `${userId}:${githubConnectionId}` : userId;
  const cached = githubQueriesCache.get(cacheKey);
  if (!cached) {
    return [];
  }

  // Cache expires after 1 hour
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  if (cached.storedAt < oneHourAgo) {
    githubQueriesCache.delete(cacheKey);
    return [];
  }

  return cached.queries || [];
}

/**
 * Find relevant GitHub queries using in-memory similarity search
 * @param {string} userId - User ID
 * @param {string} queryText - Query text to match against
 * @param {number} topK - Number of top results to return
 * @param {number} threshold - Similarity threshold
 * @param {Array} preGeneratedEmbedding - Pre-generated embedding vector
 * @param {string} connectionId - Database connection ID to filter GitHub repos
 */
async function findRelevantGitHubQueriesInMemory(
  userId,
  queryText,
  topK = 3,
  threshold = 0.3,
  preGeneratedEmbedding = null,
  connectionId = null,
) {
  let queries = [];

  if (connectionId) {
    // Find GitHub repos linked to this database connection
    const githubConnections = await GitHubRepoConnection.find({
      userId,
      isActive: true,
      connectionIds: connectionId,
    });

    console.log('[GitHub Query RAG] Found GitHub repos linked to connection:', {
      userId,
      connectionId,
      linkedReposCount: githubConnections.length,
      linkedRepos: githubConnections.map((c) => ({
        id: c._id,
        name: c.name,
        owner: c.owner,
        repo: c.repo,
      })),
    });

    // Collect queries from all linked GitHub repos
    for (const ghConn of githubConnections) {
      const cachedQueries = getCachedGitHubQueries(userId, ghConn._id.toString());
      queries.push(
        ...cachedQueries.map((q) => ({ ...q, githubConnectionId: ghConn._id.toString() })),
      );
    }

    console.log('[GitHub Query RAG] Total cached queries from linked repos:', {
      connectionId,
      totalQueries: queries.length,
    });
  } else {
    // Fall back to old behavior if no connectionId
    queries = getCachedGitHubQueries(userId);
  }

  console.log('[GitHub Query RAG] Searching for relevant queries:', {
    userId,
    connectionId,
    queryText: queryText?.substring(0, 100),
    cachedQueriesCount: queries.length,
    topK,
    threshold,
  });

  if (queries.length === 0) {
    console.log('[GitHub Query RAG] No cached queries for user - need to sync first');
    return [];
  }

  // Use pre-generated embedding or generate a new one
  let queryEmbedding = preGeneratedEmbedding;
  if (!queryEmbedding) {
    console.log('[GitHub Query RAG] Generating embedding for query...');
    queryEmbedding = await generateEmbedding(queryText);
  } else {
    console.log('[GitHub Query RAG] Using pre-generated embedding');
  }

  // Compute similarity scores for all queries
  const queriesWithScores = queries.map((query) => {
    const similarity = query.embedding ? cosineSimilarity(queryEmbedding, query.embedding) : 0;

    return {
      query,
      relevanceScore: similarity,
    };
  });

  console.log('[GitHub Query RAG] Computed similarity scores for', queries.length, 'queries');

  // Filter by threshold and sort by relevance
  const relevantQueries = queriesWithScores
    .filter((item) => item.relevanceScore >= threshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK)
    .map((item) => ({
      name: item.query.name,
      path: item.query.path,
      sqlContent: item.query.sqlContent,
      description: item.query.description,
      relevanceScore: item.relevanceScore,
    }));

  console.log(
    '[GitHub Query RAG] Found',
    relevantQueries.length,
    'relevant queries above threshold',
    threshold,
  );
  if (relevantQueries.length > 0) {
    console.log(
      '[GitHub Query RAG] Top match:',
      relevantQueries[0].name,
      'score:',
      relevantQueries[0].relevanceScore?.toFixed(4),
    );
  }

  return relevantQueries;
}

/**
 * Find relevant GitHub queries for a user query using semantic matching
 * @param {string} userId - User ID
 * @param {string} queryText - Query text to match against
 * @param {number} topK - Number of top results to return
 * @param {number} threshold - Similarity threshold
 * @param {Array} preGeneratedEmbedding - Pre-generated embedding vector
 * @param {string} connectionId - Database connection ID to filter GitHub repos
 */
async function findRelevantGitHubQueries(
  userId,
  queryText,
  topK = 3,
  threshold = 0.3,
  preGeneratedEmbedding = null,
  connectionId = null,
) {
  try {
    console.log('[GitHub Query RAG] Finding relevant GitHub queries:', {
      userId,
      connectionId,
      query: queryText?.substring(0, 100),
      topK,
      threshold,
    });

    const relevantQueries = await findRelevantGitHubQueriesInMemory(
      userId,
      queryText,
      topK,
      threshold,
      preGeneratedEmbedding,
      connectionId,
    );

    console.log('[GitHub Query RAG] Returning', relevantQueries.length, 'relevant queries');

    return relevantQueries;
  } catch (error) {
    logger.error('[GitHub Query RAG] Error finding relevant queries:', error);
    // Return empty array on error to not break the query flow
    return [];
  }
}

/**
 * Format GitHub queries for injection into prompt
 */
function formatGitHubQueriesForPrompt(queries) {
  if (!queries || queries.length === 0) {
    return '';
  }

  const queriesText = queries
    .map((query, index) => {
      const lines = [
        `Query ${index + 1}: ${query.name}`,
        `Description: ${query.description || 'No description'}`,
        `SQL: ${query.sqlContent}`,
      ];
      return lines.join('\n');
    })
    .join('\n---\n');

  return `Context from GitHub Repository Queries:\n${queriesText}`;
}

/**
 * Clear cached GitHub queries for a user (optionally for a specific GitHub connection)
 * @param {string} userId - User ID
 * @param {string} githubConnectionId - GitHub connection ID (optional)
 */
function clearGitHubQueriesCache(userId, githubConnectionId = null) {
  if (githubConnectionId) {
    const cacheKey = `${userId}:${githubConnectionId}`;
    githubQueriesCache.delete(cacheKey);
    console.log('[GitHub Query RAG] Cleared queries cache for user and GitHub connection:', {
      userId,
      githubConnectionId,
      cacheKey,
    });
  } else {
    // Clear all caches for this user (legacy behavior)
    for (const key of githubQueriesCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        githubQueriesCache.delete(key);
      }
    }
    console.log('[GitHub Query RAG] Cleared all queries caches for user:', userId);
  }
}

module.exports = {
  findRelevantGitHubQueries,
  findRelevantGitHubQueriesInMemory,
  formatGitHubQueriesForPrompt,
  storeGitHubQueriesInCache,
  getCachedGitHubQueries,
  clearGitHubQueriesCache,
  generateEmbedding,
  cosineSimilarity,
};
