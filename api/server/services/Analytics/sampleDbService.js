const fs = require('fs');
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { DatabaseType, QueryMode } = require('librechat-data-provider');

/**
 * Service for managing the shared sample database connection
 * The sample database is configured via environment variables and is available to all users
 * Users can query it but cannot see connection parameters or modify it
 */

// Fixed system user ID for sample DB schema docs (shared across all users)
const SAMPLE_DB_SYSTEM_USER_ID = 'system-sample-db';

// Cache for sample database config
let cachedSampleDbConfig = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 1 minute cache

// Cache for sample database schema (separate from config cache)
let cachedSampleDbSchema = null;
let schemaCacheTimestamp = null;
const SCHEMA_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 24 hours (1 day) cache for schema (sample db rarely changes)

// File-based cache for sample database schema (survives server restarts)
const SCHEMA_CACHE_FILE = path.join(process.cwd(), 'data', 'sample-db-schema-cache.json');

/**
 * Load schema from file cache
 * @returns {Object|null} - Cached schema or null if not found/expired
 */
function loadSchemaFromFile() {
  try {
    if (!fs.existsSync(SCHEMA_CACHE_FILE)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(SCHEMA_CACHE_FILE, 'utf8'));
    
    // Check if cache is still valid (24 hours)
    const age = Date.now() - data.cachedAt;
    if (age > SCHEMA_CACHE_TTL_MS) {
      logger.debug('[SampleDB] File cache expired');
      return null;
    }
    
    logger.info('[SampleDB] 🧩 Loaded schema from file cache');
    return data.schema;
  } catch (error) {
    logger.debug('[SampleDB] Failed to load schema from file:', error.message);
    return null;
  }
}

/**
 * Save schema to file cache
 * @param {Object} schema - The schema to cache
 */
function saveSchemaToFile(schema) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(SCHEMA_CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const data = {
      schema,
      cachedAt: Date.now(),
    };
    
    fs.writeFileSync(SCHEMA_CACHE_FILE, JSON.stringify(data, null, 2));
    logger.info('[SampleDB] Schema saved to file cache');
  } catch (error) {
    logger.warn('[SampleDB] Failed to save schema to file:', error.message);
  }
}

/**
 * Check if sample database is enabled
 * @returns {boolean}
 */
function isSampleDbEnabled() {
  return process.env.SAMPLE_DB_ENABLED === 'true' && hasRequiredConfig();
}

/**
 * Check if all required configuration is present
 * @returns {boolean}
 */
function hasRequiredConfig() {
  const required = [
    'SAMPLE_DB_HOST',
    'SAMPLE_DB_PORT',
    'SAMPLE_DB_DATABASE',
    'SAMPLE_DB_USERNAME',
    'SAMPLE_DB_PASSWORD',
  ];
  return required.every((key) => process.env[key] && process.env[key].trim() !== '');
}

/**
 * Get sample database configuration from environment variables
 * @returns {Object|null} Sample DB configuration or null if not configured
 */
function getSampleDbConfig() {
  // Return cached config if valid
  if (cachedSampleDbConfig && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSampleDbConfig;
  }

  if (!isSampleDbEnabled()) {
    return null;
  }

  try {
    const port = parseInt(process.env.SAMPLE_DB_PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      logger.error('[SampleDB] Invalid port number:', process.env.SAMPLE_DB_PORT);
      return null;
    }

    const config = {
      _id: 'sample-db', // Fixed ID for the sample database
      name: process.env.SAMPLE_DB_NAME || 'Sample Database',
      type: DatabaseType.POSTGRESQL, // Only PostgreSQL is supported for sample DB
      host: process.env.SAMPLE_DB_HOST,
      port: port,
      database: process.env.SAMPLE_DB_DATABASE,
      username: process.env.SAMPLE_DB_USERNAME,
      password: process.env.SAMPLE_DB_PASSWORD,
      ssl: process.env.SAMPLE_DB_SSL === 'true',
      sslCertificate: process.env.SAMPLE_DB_SSL_CA_PATH || undefined,
      queryMode: QueryMode.READ_ONLY, // Sample DB is always read-only
      queryTimeout: parseInt(process.env.SAMPLE_DB_QUERY_TIMEOUT, 10) || 30000,
      maxRows: parseInt(process.env.SAMPLE_DB_MAX_ROWS, 10) || 1000,
      organizationId: 'system',
      createdBy: null,
      isActive: true,
      isSystem: true,
      lastTestSuccess: true, // Assume working, will be validated on first use
    };

    // Cache the config
    cachedSampleDbConfig = config;
    cacheTimestamp = Date.now();

    return config;
  } catch (error) {
    logger.error('[SampleDB] Error loading sample database configuration:', error);
    return null;
  }
}

/**
 * Clear the cached config and schema (useful for testing or when env vars change)
 */
function clearCache() {
  cachedSampleDbConfig = null;
  cacheTimestamp = null;
  cachedSampleDbSchema = null;
  schemaCacheTimestamp = null;
}

/**
 * Get sample database as a connection object (for API responses)
 * @returns {Object|null}
 */
function getSampleDbAsConnection() {
  const config = getSampleDbConfig();
  if (!config) {
    return null;
  }

  // Return a sanitized version (no password) for API responses
  return {
    _id: config._id,
    name: config.name,
    type: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    username: '', // Don't expose username
    ssl: config.ssl,
    queryMode: config.queryMode,
    queryTimeout: config.queryTimeout,
    maxRows: config.maxRows,
    organizationId: config.organizationId,
    createdBy: null,
    isActive: true,
    isSystem: true,
    lastTestedAt: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : undefined,
    lastTestSuccess: true,
  };
}

/**
 * Get sample database with credentials (for internal use like querying)
 * @returns {Object|null}
 */
function getSampleDbWithCredentials() {
  return getSampleDbConfig();
}

/**
 * Test the sample database connection
 * @returns {Promise<Object>} Test result
 */
async function testSampleDbConnection() {
  const config = getSampleDbConfig();
  if (!config) {
    return {
      success: false,
      message: 'Sample database is not configured',
    };
  }

  try {
    const { testConnection } = require('./connectionService');
    const result = await testConnection({
      type: config.type,
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      ssl: config.ssl,
      sslCertificate: config.sslCertificate,
    });

    // Update cache timestamp on success
    if (result.success) {
      cacheTimestamp = Date.now();
    }

    return result;
  } catch (error) {
    logger.error('[SampleDB] Connection test failed:', error);
    return {
      success: false,
      message: error.message || 'Failed to connect to sample database',
    };
  }
}

/**
 * Extract schema from sample database
 * Uses in-memory + file caching to avoid repeated extractions
 * @param {boolean} forceRefresh - Force fresh extraction even if cache is valid
 * @returns {Promise<Object|null>}
 */
async function extractSampleDbSchema(forceRefresh = false) {
  const config = getSampleDbConfig();
  if (!config) {
    return null;
  }

  // 1. Return in-memory cached schema if valid (fastest)
  if (!forceRefresh && cachedSampleDbSchema && schemaCacheTimestamp && 
      Date.now() - schemaCacheTimestamp < SCHEMA_CACHE_TTL_MS) {
    logger.debug('[SampleDB] Returning in-memory cached schema');
    return cachedSampleDbSchema;
  }

  // 2. Try to load from file cache (survives server restarts)
  if (!forceRefresh) {
    const fileCachedSchema = loadSchemaFromFile();
    if (fileCachedSchema) {
      // Populate in-memory cache for next time
      cachedSampleDbSchema = fileCachedSchema;
      schemaCacheTimestamp = Date.now();
      logger.debug('[SampleDB] Returning file-cached schema');
      return fileCachedSchema;
    }
  }

  // 3. Extract fresh schema from database
  try {
    logger.info('[SampleDB] Extracting fresh schema from database...');
    const { extractSchema } = require('./connectionService');
    const { storeTableNameEmbeddings } = require('./embeddingService');
    
    const schema = await extractSchema({
      type: config.type,
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      ssl: config.ssl,
      sslCertificate: config.sslCertificate,
    });

    // Cache in memory
    cachedSampleDbSchema = schema;
    schemaCacheTimestamp = Date.now();
    
    // Cache to file (survives restarts)
    saveSchemaToFile(schema);
    
    logger.info('[SampleDB] Schema extracted and cached successfully');
    
    // Store table name embeddings for hybrid RAG (fire and forget)
    if (schema?.tables?.length > 0) {
      storeTableNameEmbeddings('sample-db', schema).catch(err => {
        logger.debug('[SampleDB] Failed to store table embeddings:', err.message);
      });
    }

    return schema;
  } catch (error) {
    logger.error('[SampleDB] Schema extraction failed:', error);
    return null;
  }
}

/**
 * Initialize sample database schema documentation in RAG API
 * This should be called on server startup if sample DB is enabled
 * @param {string} systemUserId - A valid user ID to use for RAG API authentication (can be any user since sample DB is shared)
 * @param {boolean} force - Force re-initialization even if docs exist (default: false)
 * @returns {Promise<boolean>}
 */
async function initializeSampleDbSchemaDocs(force = false) {
  if (!isSampleDbEnabled()) {
    logger.info('[SampleDB] Sample database not enabled, skipping schema documentation initialization');
    return false;
  }

  try {
    // Check if docs already exist (unless force is true)
    if (!force) {
      const exists = await checkSampleDbSchemaDocsExist();
      if (exists) {
        logger.info('[SampleDB] Schema documentation already exists, skipping initialization (use force=true to re-initialize)');
        return true;
      }
    }

    logger.info('[SampleDB] 🚀 Initializing sample database schema documentation...');

    // Extract schema from sample database
    const schema = await extractSampleDbSchema();
    if (!schema) {
      logger.error('[SampleDB] Failed to extract schema for documentation');
      return false;
    }

    // Generate documentation chunks
    const {
      generateSchemaDocumentation,
      embedSchemaDocumentation,
    } = require('./schemaDocumentationRAG');

    const chunks = generateSchemaDocumentation(schema, 'sample-db', DatabaseType.POSTGRESQL);
    if (chunks.length === 0) {
      logger.warn('[SampleDB] No documentation chunks generated');
      return false;
    }

    // Embed schema documentation using fixed system user ID (shared across all users)
    await embedSchemaDocumentation(chunks, SAMPLE_DB_SYSTEM_USER_ID);

    logger.info('[SampleDB] ✅ Sample database schema documentation initialized successfully:', {
      chunkCount: chunks.length,
      tableCount: schema.tables?.length || 0,
    });

    return true;
  } catch (error) {
    logger.error('[SampleDB] Error initializing schema documentation:', error);
    return false;
  }
}

/**
 * Initialize sample database table name embeddings for hybrid RAG
 * This enables semantic search on table names
 * @param {boolean} force - Force re-initialization even if embeddings exist (default: false)
 * @returns {Promise<boolean>}
 */
async function initializeSampleDbTableEmbeddings(force = false) {
  if (!isSampleDbEnabled()) {
    logger.info('[SampleDB] Sample database not enabled, skipping table embeddings initialization');
    return false;
  }

  try {
    // Check if embeddings already exist (unless force is true)
    if (!force) {
      const { findRelevantTablesByEmbedding } = require('./tableRAGService');
      const { generateEmbedding } = require('./embeddingService');
      
      // Try a test query to check if embeddings exist
      const testEmbedding = await generateEmbedding('test');
      const existingTables = await findRelevantTablesByEmbedding('sample-db', testEmbedding, 1);
      
      if (existingTables.length > 0) {
        logger.info('[SampleDB] Table name embeddings already exist, skipping initialization (use force=true to re-initialize)');
        return true;
      }
    }

    logger.info('[SampleDB] 🚀 Initializing sample database table name embeddings...');

    // Extract schema from sample database
    const schema = await extractSampleDbSchema();
    if (!schema || !schema.tables || schema.tables.length === 0) {
      logger.error('[SampleDB] Failed to extract schema for table embeddings');
      return false;
    }

    // Store table name embeddings
    const { storeTableNameEmbeddings } = require('./embeddingService');
    const count = await storeTableNameEmbeddings('sample-db', schema);

    logger.info('[SampleDB] ✅ Sample database table name embeddings initialized successfully:', {
      tableCount: count,
    });

    return true;
  } catch (error) {
    logger.error('[SampleDB] Error initializing table name embeddings:', error);
    return false;
  }
}

/**
 * Check if sample database schema documentation exists in RAG API
 * Uses fixed system user ID so all users share the same embeddings
 * @returns {Promise<boolean>}
 */
async function checkSampleDbSchemaDocsExist() {
  if (!isSampleDbEnabled()) {
    return false;
  }

  try {
    const { querySchemaDocumentation } = require('./schemaDocumentationRAG');
    const result = await querySchemaDocumentation('test', 'sample-db', SAMPLE_DB_SYSTEM_USER_ID, { k: 1 });
    return result && result.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get the current schema cache status for external checks
 * @returns {Object} Cache status with isValid, age, and ttl info
 */
function getSampleDbSchemaCacheStatus() {
  const isValid = cachedSampleDbSchema && schemaCacheTimestamp && 
    Date.now() - schemaCacheTimestamp < SCHEMA_CACHE_TTL_MS;
  
  return {
    isValid: !!isValid,
    cachedAt: schemaCacheTimestamp,
    ageMs: schemaCacheTimestamp ? Date.now() - schemaCacheTimestamp : null,
    ttlMs: SCHEMA_CACHE_TTL_MS,
    hasSchema: !!cachedSampleDbSchema,
  };
}

module.exports = {
  isSampleDbEnabled,
  getSampleDbConfig,
  getSampleDbAsConnection,
  getSampleDbWithCredentials,
  testSampleDbConnection,
  extractSampleDbSchema,
  initializeSampleDbSchemaDocs,
  initializeSampleDbTableEmbeddings,
  checkSampleDbSchemaDocsExist,
  clearCache,
  SAMPLE_DB_SYSTEM_USER_ID,
  getSampleDbSchemaCacheStatus,
};
