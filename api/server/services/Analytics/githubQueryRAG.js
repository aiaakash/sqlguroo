/**
 * GitHub Query RAG Service
 * Provides RAG-based retrieval for SQL queries stored in GitHub repositories
 */

const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');

// Initialize OpenRouter client for embeddings (uses OpenAI-compatible API)
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Embedding model - use environment variable or default to Qwen/Qwen3-embedding-8b
const EMBEDDING_MODEL = process.env.ANALYTICS_EMBEDDING_MODEL || 'openai/text-embedding-3-small';

// In-memory cache for GitHub queries (keyed by userId)
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
 */
async function storeGitHubQueriesInCache(userId, queries) {
  if (!queries || queries.length === 0) {
    console.log('[GitHub Query RAG] No queries to cache');
    return;
  }

  console.log('[GitHub Query RAG] Storing queries in cache:', {
    userId,
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
  githubQueriesCache.set(userId, {
    queries: validQueries,
    storedAt: new Date(),
  });

  console.log('[GitHub Query RAG] Stored queries in cache:', {
    userId,
    queryCount: validQueries.length,
  });
}

/**
 * Get cached GitHub queries for a user
 */
function getCachedGitHubQueries(userId) {
  const cached = githubQueriesCache.get(userId);
  if (!cached) {
    return [];
  }

  // Cache expires after 1 hour
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  if (cached.storedAt < oneHourAgo) {
    githubQueriesCache.delete(userId);
    return [];
  }

  return cached.queries || [];
}

/**
 * Find relevant GitHub queries using in-memory similarity search
 */
async function findRelevantGitHubQueriesInMemory(
  userId,
  queryText,
  topK = 3,
  threshold = 0.3,
  preGeneratedEmbedding = null,
) {
  const queries = getCachedGitHubQueries(userId);

  console.log('[GitHub Query RAG] Searching for relevant queries:', {
    userId,
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
 */
async function findRelevantGitHubQueries(
  userId,
  queryText,
  topK = 3,
  threshold = 0.3,
  preGeneratedEmbedding = null,
) {
  try {
    console.log('[GitHub Query RAG] Finding relevant GitHub queries:', {
      userId,
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
 * Clear cached GitHub queries for a user
 */
function clearGitHubQueriesCache(userId) {
  githubQueriesCache.delete(userId);
  console.log('[GitHub Query RAG] Cleared queries cache for user:', userId);
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
