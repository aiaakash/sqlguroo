const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { DatabaseConnection } = require('~/db/models');
const {
  encryptCredentials,
  decryptCredentials,
} = require('~/server/services/Analytics/encryption');
const {
  testConnection,
  extractSchema,
  extractSchemaAndStoreEmbeddings,
} = require('~/server/services/Analytics/connectionService');
const {
  isSampleDbEnabled,
  getSampleDbAsConnection,
  getSampleDbWithCredentials,
  testSampleDbConnection,
  extractSampleDbSchema,
} = require('~/server/services/Analytics/sampleDbService');
const connectorFactory = require('~/server/services/Analytics/connectors');
const { getLogStores } = require('~/cache');
const {
  generateSchemaDocumentation,
  embedSchemaDocumentation,
  deleteSchemaDocumentation,
} = require('~/server/services/Analytics/schemaDocumentationRAG');

const router = express.Router();

/**
 * @route GET /api/analytics/connections
 * @desc Get all database connections for the user's organization
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.query;

    // Base query: only return connections created by the current user
    let query = { createdBy: req.user.id, isActive: true };

    // If organizationId is provided, also filter by organization
    if (organizationId && organizationId.trim() !== '') {
      query.organizationId = organizationId.trim();
    }

    const connections = await DatabaseConnection.find(query)
      .select('-password -sslCertificate')
      .sort({ createdAt: -1 }); // Sort by creation date, newest first

    // Add sample database if enabled (at the beginning of the list)
    const sampleDb = getSampleDbAsConnection();
    if (sampleDb) {
      connections.unshift(sampleDb);
    }

    res.status(200).json(connections);
  } catch (error) {
    logger.error('Error fetching database connections:', error);
    res.status(500).json({ error: 'Error fetching database connections' });
  }
});

/**
 * @route GET /api/analytics/connections/:id
 * @desc Get a specific database connection
 * @access Private
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if requesting sample database
    if (id === 'sample-db') {
      const sampleDb = getSampleDbAsConnection();
      if (sampleDb) {
        return res.status(200).json(sampleDb);
      }
      return res.status(404).json({ error: 'Sample database not found or not configured' });
    }

    const connection = await DatabaseConnection.findById(id).select('-password -sslCertificate');

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.status(200).json(connection);
  } catch (error) {
    logger.error('Error fetching database connection:', error);
    res.status(500).json({ error: 'Error fetching database connection' });
  }
});

/**
 * @route POST /api/analytics/connections
 * @desc Create a new database connection
 * @access Private
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      type,
      host,
      port,
      database,
      username,
      password,
      ssl,
      sslCertificate,
      queryMode,
      queryTimeout,
      maxRows,
      organizationId,
      connectionParams,
    } = req.body;

    const connector = connectorFactory.getConnector(type);
    const validation = connector.validateConfig(req.body);

    if (!validation.valid) {
      return res.status(400).json({ error: `Validation failed: ${validation.errors.join(', ')}` });
    }

    // Validate port is a number (only for non-BigQuery databases)
    let portNumber = 0;
    if (host && port) {
      // Only validate port if host is provided (i.e., not BigQuery)
      portNumber = parseInt(port, 10);
      if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
        return res.status(400).json({ error: 'Invalid port number' });
      }
    }

    // Check for duplicate name for this user (only active connections)
    // Use case-insensitive comparison and trim both sides
    const trimmedName = name.trim();
    const existing = await DatabaseConnection.findOne({
      createdBy: req.user.id,
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isActive: true,
    });
    if (existing) {
      return res.status(409).json({ error: 'A connection with this name already exists' });
    }

    // Encrypt sensitive data
    let encryptedPassword;
    let encryptedCertificate;
    try {
      encryptedPassword = encryptCredentials(password);
      encryptedCertificate = sslCertificate ? encryptCredentials(sslCertificate) : undefined;
    } catch (encryptError) {
      logger.error('Encryption error:', encryptError);
      return res
        .status(500)
        .json({ error: 'Failed to encrypt credentials', message: encryptError.message });
    }

    const connection = new DatabaseConnection({
      name: name.trim(),
      type,
      host: host ? host.trim() : '',
      port: portNumber,
      database: database.trim(),
      username: username ? username.trim() : '',
      password: encryptedPassword,
      ssl: ssl || false,
      sslCertificate: encryptedCertificate,
      queryMode: queryMode || 'read_only',
      queryTimeout: queryTimeout || 30000,
      maxRows: maxRows || null,
      organizationId,
      createdBy: req.user.id,
      isActive: true,
      connectionParams: connectionParams || {},
    });

    await connection.save();

    // Clear models cache so the new connection appears in the dropdown
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(`${CacheKeys.MODELS_CONFIG}:${req.user.id}`);

    // Extract and embed schema documentation for new connection (async, don't block response)
    console.log(
      '[Schema Docs Integration] 🚀 Triggering initial schema extraction and embedding for new connection:',
      {
        connectionId: connection._id.toString(),
        connectionName: connection.name,
        databaseType: connection.type,
        userId: req.user.id,
      },
    );

    (async () => {
      try {
        // Extract schema first
        const decryptedPassword = decryptCredentials(connection.password);
        const schema = await extractSchema({
          type: connection.type,
          host: connection.host,
          port: connection.port,
          database: connection.database,
          username: connection.username,
          password: decryptedPassword,
          ssl: connection.ssl,
          sslCertificate: connection.sslCertificate
            ? decryptCredentials(connection.sslCertificate)
            : undefined,
        });

        // Cache the schema
        connection.cachedSchema = schema;
        connection.schemaCachedAt = new Date();
        await connection.save();

        // Embed schema documentation
        await embedSchemaDocumentationAsync(
          connection._id.toString(),
          schema,
          connection.type,
          req.user.id,
        );

        console.log(
          '[Schema Docs Integration] ✅ Successfully completed initial schema extraction and embedding for new connection:',
          {
            connectionId: connection._id.toString(),
          },
        );
        logger.info(
          `[Schema Docs] Successfully extracted and embedded schema for new connection ${connection._id}`,
        );
      } catch (error) {
        console.log(
          '[Schema Docs Integration] ⚠️  Failed to extract/embed schema for new connection (non-blocking):',
          {
            connectionId: connection._id.toString(),
            error: error.message,
          },
        );
        logger.warn(
          `[Schema Docs] Failed to extract/embed schema for new connection ${connection._id}:`,
          error,
        );
        // Don't throw - this is non-blocking for connection creation
      }
    })();

    // Return connection without sensitive data
    const savedConnection = connection.toObject();
    delete savedConnection.password;
    delete savedConnection.sslCertificate;

    logger.info(`Database connection created: ${name} (${type}) by user ${req.user.id}`);
    res.status(201).json(savedConnection);
  } catch (error) {
    logger.error('Error creating database connection:', error);
    logger.error('Error stack:', error.stack);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err) => err.message);
      return res.status(400).json({
        error: 'Validation error',
        message: validationErrors.join(', '),
        details: process.env.NODE_ENV === 'development' ? error.errors : undefined,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'A connection with this name already exists for this organization',
      });
    }

    res.status(500).json({
      error: 'Error creating database connection',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * @route PUT /api/analytics/connections/:id
 * @desc Update a database connection
 * @access Private
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Block updates to sample database
    if (id === 'sample-db') {
      return res.status(403).json({ error: 'Cannot modify the sample database connection' });
    }

    const connection = await DatabaseConnection.findById(id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Check for duplicate name if name is being changed
    if (updates.name && updates.name !== connection.name) {
      const existingConnection = await DatabaseConnection.findOne({
        name: updates.name,
        organizationId: connection.organizationId,
        isActive: true,
        _id: { $ne: id }, // Exclude the current connection
      });

      if (existingConnection) {
        return res.status(409).json({
          error: 'A connection with this name already exists',
          field: 'name',
        });
      }
    }

    // Handle password update if provided (skip if empty string to preserve existing)
    if (updates.password) {
      updates.password = encryptCredentials(updates.password);
    } else if (updates.password === '') {
      // If password is explicitly empty string, remove it from updates to preserve existing
      delete updates.password;
    }

    // Handle SSL certificate update if provided
    if (updates.sslCertificate) {
      updates.sslCertificate = encryptCredentials(updates.sslCertificate);
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'host',
      'port',
      'database',
      'username',
      'password',
      'ssl',
      'sslCertificate',
      'queryMode',
      'queryTimeout',
      'maxRows',
      'isActive',
      'connectionParams',
    ];

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        connection[field] = updates[field];
      }
    });

    await connection.save();

    // Clear models cache so any name changes are reflected in the dropdown
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(`${CacheKeys.MODELS_CONFIG}:${req.user.id}`);

    // Return connection without sensitive data
    const updatedConnection = connection.toObject();
    delete updatedConnection.password;
    delete updatedConnection.sslCertificate;

    logger.info(`Database connection updated: ${connection.name} by user ${req.user.id}`);
    res.status(200).json(updatedConnection);
  } catch (error) {
    logger.error('Error updating database connection:', error);

    // Handle duplicate key error (MongoDB error code 11000)
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'A connection with this name already exists',
        field: 'name',
      });
    }

    res.status(500).json({ error: 'Error updating database connection' });
  }
});

/**
 * @route DELETE /api/analytics/connections/:id
 * @desc Delete (soft-delete) a database connection
 * @access Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Block deletion of sample database
    if (id === 'sample-db') {
      return res.status(403).json({ error: 'Cannot delete the sample database connection' });
    }

    const connection = await DatabaseConnection.findById(id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Soft delete by setting isActive to false
    connection.isActive = false;
    await connection.save();

    // Clear models cache so the deleted connection is removed from the dropdown
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(`${CacheKeys.MODELS_CONFIG}:${req.user.id}`);

    logger.info(`Database connection deleted: ${connection.name} by user ${req.user.id}`);
    res.status(200).json({ message: 'Connection deleted successfully' });
  } catch (error) {
    logger.error('Error deleting database connection:', error);
    res.status(500).json({ error: 'Error deleting database connection' });
  }
});

/**
 * @route POST /api/analytics/connections/:id/test
 * @desc Test a database connection
 * @access Private
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    // Handle sample database test
    if (id === 'sample-db') {
      const result = await testSampleDbConnection();
      return res.status(200).json(result);
    }

    const connection = await DatabaseConnection.findById(id).select('+password +sslCertificate');
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Decrypt credentials for testing
    const decryptedPassword = decryptCredentials(connection.password);

    const result = await testConnection({
      type: connection.type,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: decryptedPassword,
      ssl: connection.ssl,
      sslCertificate: connection.sslCertificate
        ? decryptCredentials(connection.sslCertificate)
        : undefined,
    });

    // Update last tested info
    connection.lastTestedAt = new Date();
    connection.lastTestSuccess = result.success;
    await connection.save();

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error testing database connection:', error);
    res.status(500).json({ error: 'Error testing database connection', success: false });
  }
});

/**
 * @route POST /api/analytics/connections/test-new
 * @desc Test a new database connection without saving
 * @access Private
 */
router.post('/test-new', async (req, res) => {
  try {
    const {
      type,
      host,
      port,
      database,
      username,
      password,
      ssl,
      sslCertificate,
      connectionParams,
    } = req.body;

    const connector = connectorFactory.getConnector(type);
    const validation = connector.validateConfig(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: `Validation fails: ${validation.errors.join(', ')}`,
        success: false,
      });
    }

    const result = await testConnection({
      type,
      host: host || '',
      port: port || 0,
      database,
      username: username || '',
      password,
      ssl: ssl || false,
      sslCertificate,
      connectionParams,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error testing database connection:', error);
    res.status(500).json({ error: 'Error testing database connection', success: false });
  }
});

/**
 * @route POST /api/analytics/connections/:id/refresh-schema
 * @desc Refresh the cached schema for a connection
 * @access Private
 */
router.post('/:id/refresh-schema', async (req, res) => {
  try {
    const { id } = req.params;

    // Handle sample database schema refresh
    if (id === 'sample-db') {
      const schema = await extractSampleDbSchema();
      if (!schema) {
        return res.status(500).json({ error: 'Failed to extract schema from sample database' });
      }
      return res.status(200).json({ schema, cachedAt: new Date() });
    }

    const connection = await DatabaseConnection.findById(id).select('+password +sslCertificate');
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Decrypt credentials for schema extraction
    const decryptedPassword = decryptCredentials(connection.password);

    const schema = await extractSchema({
      type: connection.type,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: decryptedPassword,
      ssl: connection.ssl,
      sslCertificate: connection.sslCertificate
        ? decryptCredentials(connection.sslCertificate)
        : undefined,
    });

    // Update only the cached schema fields, preserving table/column descriptions
    await DatabaseConnection.findByIdAndUpdate(id, {
      cachedSchema: schema,
      schemaCachedAt: new Date(),
    });

    // Embed schema documentation into RAG API (async, don't block response)
    console.log(
      '[Schema Docs Integration] 🚀 Triggering schema documentation embedding after refresh:',
      {
        connectionId: connection._id.toString(),
        connectionName: connection.name,
        databaseType: connection.type,
        tableCount: schema?.tables?.length || 0,
        userId: req.user.id,
      },
    );
    embedSchemaDocumentationAsync(
      connection._id.toString(),
      schema,
      connection.type,
      req.user.id,
    ).catch((error) => {
      console.log('[Schema Docs Integration] ❌ Failed to embed schema documentation:', {
        connectionId: connection._id.toString(),
        error: error.message,
      });
      logger.warn('[Schema Docs] Failed to embed schema documentation:', error);
    });

    res.status(200).json({ schema, cachedAt: connection.schemaCachedAt });
  } catch (error) {
    logger.error('Error refreshing schema:', error);
    res.status(500).json({ error: 'Error refreshing schema' });
  }
});

/**
 * @route GET /api/analytics/connections/:id/schema
 * @desc Get the cached schema for a connection
 * @access Private
 */
router.get('/:id/schema', async (req, res) => {
  try {
    const { id } = req.params;
    const { refresh } = req.query;

    // Handle sample database schema
    if (id === 'sample-db') {
      // Always fetch fresh schema for sample DB (no caching in DB)
      const schema = await extractSampleDbSchema();
      if (!schema) {
        return res.status(500).json({ error: 'Failed to extract schema from sample database' });
      }
      return res.status(200).json({ schema, cachedAt: new Date() });
    }

    const connection = await DatabaseConnection.findById(id).select('+password +sslCertificate');
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Check if we need to refresh the schema
    const shouldRefresh =
      refresh === 'true' ||
      !connection.cachedSchema ||
      !connection.schemaCachedAt ||
      Date.now() - connection.schemaCachedAt.getTime() > 24 * 60 * 60 * 1000; // 24 hours

    if (shouldRefresh) {
      const decryptedPassword = decryptCredentials(connection.password);

      const schema = await extractSchemaAndStoreEmbeddings(
        {
          type: connection.type,
          host: connection.host,
          port: connection.port,
          database: connection.database,
          username: connection.username,
          password: decryptedPassword,
          ssl: connection.ssl,
          sslCertificate: connection.sslCertificate
            ? decryptCredentials(connection.sslCertificate)
            : undefined,
        },
        id,
      );

      // Update only the cached schema fields, preserving table/column descriptions
      await DatabaseConnection.findByIdAndUpdate(id, {
        cachedSchema: schema,
        schemaCachedAt: new Date(),
      });

      // Embed schema documentation into RAG API (async, don't block response)
      console.log(
        '[Schema Docs Integration] 🚀 Triggering schema documentation embedding after schema fetch:',
        {
          connectionId: connection._id.toString(),
          connectionName: connection.name,
          databaseType: connection.type,
          tableCount: schema?.tables?.length || 0,
          userId: req.user.id,
        },
      );
      embedSchemaDocumentationAsync(id, schema, connection.type, req.user.id).catch((error) => {
        console.log('[Schema Docs Integration] ❌ Failed to embed schema documentation:', {
          connectionId: id,
          error: error.message,
        });
        logger.warn('[Schema Docs] Failed to embed schema documentation:', error);
      });

      return res.status(200).json({ schema, cachedAt: new Date() });
    }

    res.status(200).json({ schema: connection.cachedSchema, cachedAt: connection.schemaCachedAt });
  } catch (error) {
    logger.error('Error getting schema:', error);
    res.status(500).json({ error: 'Error getting schema' });
  }
});

/**
 * Helper function to embed schema documentation asynchronously
 * @param {string} connectionId - Connection ID
 * @param {Object} schema - Extracted schema
 * @param {string} databaseType - Database type
 * @param {string} userId - User ID
 */
async function embedSchemaDocumentationAsync(connectionId, schema, databaseType, userId) {
  console.log('[Schema Docs Integration] 📋 embedSchemaDocumentationAsync called:', {
    connectionId,
    databaseType,
    userId,
    tableCount: schema?.tables?.length || 0,
  });

  try {
    // Generate schema documentation chunks
    const chunks = generateSchemaDocumentation(schema, connectionId, databaseType);

    if (chunks.length === 0) {
      console.log('[Schema Docs Integration] ⚠️  No documentation chunks generated:', {
        connectionId,
        tableCount: schema?.tables?.length || 0,
      });
      logger.debug(
        `[Schema Docs] No documentation chunks generated for connection ${connectionId}`,
      );
      return;
    }

    console.log('[Schema Docs Integration] ✅ Generated chunks, proceeding with embedding:', {
      connectionId,
      chunkCount: chunks.length,
    });

    // Delete old schema documentation first
    await deleteSchemaDocumentation(connectionId, userId);

    // Embed new schema documentation
    await embedSchemaDocumentation(chunks, userId);

    console.log(
      '[Schema Docs Integration] ✅ Successfully completed schema documentation embedding:',
      {
        connectionId,
        chunkCount: chunks.length,
      },
    );
    logger.info(
      `[Schema Docs] Successfully embedded schema documentation for connection ${connectionId}`,
    );
  } catch (error) {
    console.log('[Schema Docs Integration] ❌ Error in embedSchemaDocumentationAsync:', {
      connectionId,
      error: error.message,
      stack: error.stack,
    });
    logger.error(
      `[Schema Docs] Error embedding schema documentation for connection ${connectionId}:`,
      error,
    );
    throw error;
  }
}

/**
 * @route POST /api/analytics/connections/:id/table-descriptions
 * @desc Save table and column descriptions for a connection
 * @access Private
 */
router.post('/:id/table-descriptions', async (req, res) => {
  try {
    const { id } = req.params;
    const { tableDescriptions, columnDescriptions } = req.body;

    const connection = await DatabaseConnection.findById(id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Initialize plain objects if they don't exist
    if (!connection.tableDescriptions) {
      connection.tableDescriptions = {};
    }
    if (!connection.columnDescriptions) {
      connection.columnDescriptions = {};
    }

    // Update table descriptions in separate field (persists across schema refreshes)
    if (tableDescriptions) {
      Object.entries(tableDescriptions).forEach(([tableName, description]) => {
        if (description) {
          connection.tableDescriptions[tableName] = description;
        } else {
          delete connection.tableDescriptions[tableName];
        }
      });
    }

    // Update column descriptions in separate field (persists across schema refreshes)
    if (columnDescriptions) {
      Object.entries(columnDescriptions).forEach(([key, description]) => {
        if (description) {
          connection.columnDescriptions[key] = description;
        } else {
          delete connection.columnDescriptions[key];
        }
      });
    }

    // Mark both fields as modified
    connection.markModified('tableDescriptions');
    connection.markModified('columnDescriptions');
    await connection.save();

    res.status(200).json({
      success: true,
      message: 'Descriptions saved successfully',
    });
  } catch (error) {
    logger.error('Error saving table descriptions:', error);
    res.status(500).json({ error: 'Error saving descriptions', details: error.message });
  }
});

/**
 * @route GET /api/analytics/connections/:id/table-descriptions
 * @desc Get table and column descriptions for a connection
 * @access Private
 */
router.get('/:id/table-descriptions', async (req, res) => {
  try {
    const { id } = req.params;

    // Use lean() to get plain JavaScript objects instead of Mongoose documents
    const connection = await DatabaseConnection.findById(id).lean();
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.status(200).json({
      tableDescriptions: connection.tableDescriptions || {},
      columnDescriptions: connection.columnDescriptions || {},
    });
  } catch (error) {
    logger.error('Error getting table descriptions:', error);
    res.status(500).json({ error: 'Error getting descriptions' });
  }
});

module.exports = router;
