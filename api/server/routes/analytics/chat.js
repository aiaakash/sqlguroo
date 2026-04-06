const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { GenerationJobManager } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { DatabaseConnection, AnalyticsQuery } = require('~/db/models');
const { decryptCredentials } = require('~/server/services/Analytics/encryption');
const { generateSqlQuery } = require('~/server/services/Analytics/queryGenerator');
const { executeQuery } = require('~/server/services/Analytics/queryExecutor');
const { extractSchema, extractSchemaAndStoreEmbeddings } = require('~/server/services/Analytics/connectionService');
const { getSampleDbWithCredentials, extractSampleDbSchema } = require('~/server/services/Analytics/sampleDbService');
const { DatabaseError } = require('~/server/services/Analytics/DatabaseError');
const { saveConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { enforceQueryLimit, requireJwtAuth } = require('~/server/middleware');
const subscriptionService = require('~/server/services/SubscriptionService');

const router = express.Router();

/**
 * @route GET /stream/:streamId
 * @desc Subscribe to an ongoing generation job's SSE stream
 * @access Private
 */
router.get('/stream/:streamId', async (req, res) => {
    const { streamId } = req.params;
    const isResume = req.query.resume === 'true';

    const job = await GenerationJobManager.getJob(streamId);
    if (!job) {
        return res.status(404).json({
            error: 'Stream not found',
            message: 'The generation job does not exist or has expired.',
        });
    }

    // Security check: ensure user accessing stream matches job owner
    if (job.metadata.userId !== req.user.id) {
        logger.warn(`[AnalyticsStream] Unauthorized access attempt: ${req.user.id} tried to access ${streamId} owned by ${job.metadata.userId}`);
        return res.status(403).json({ error: 'Unauthorized' });
    }

    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    logger.debug(`[AnalyticsStream] Client subscribed to ${streamId}, resume: ${isResume}`);

    if (isResume) {
        const resumeState = await GenerationJobManager.getResumeState(streamId);
        if (resumeState && !res.writableEnded) {
            res.write(`event: message\ndata: ${JSON.stringify({ sync: true, resumeState })}\n\n`);
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }
    }

    const result = await GenerationJobManager.subscribe(
        streamId,
        (event) => {
            if (!res.writableEnded) {
                res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
                if (typeof res.flush === 'function') {
                    res.flush();
                }
            }
        },
        (event) => {
            if (!res.writableEnded) {
                res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
                if (typeof res.flush === 'function') {
                    res.flush();
                }
                res.end();
            }
        },
        (error) => {
            if (!res.writableEnded) {
                res.write(`event: error\ndata: ${JSON.stringify({ error })}\n\n`);
                if (typeof res.flush === 'function') {
                    res.flush();
                }
                res.end();
            }
        },
    );

    if (!result) {
        return res.status(404).json({ error: 'Failed to subscribe to stream' });
    }

    req.on('close', () => {
        logger.debug(`[AnalyticsStream] Client disconnected from ${streamId}`);
        result.unsubscribe();
    });
});

/**
 * @route POST /api/analytics/chat
 * @desc Process an analytics chat request - generate SQL and optionally execute it
 * @access Private
 * @note Returns streamId immediately, then processes request in background and emits via SSE
 */
router.post('/', enforceQueryLimit, async (req, res) => {
    logger.info('[Analytics Chat] Request received:', {
        method: req.method,
        path: req.path,
        body: { ...req.body, text: req.body.text?.substring(0, 100), model: req.body.model },
        userId: req.user?.id,
    });

    try {
        // Accept standard chat format: text, model (connectionId), conversationId, etc.
        const { text, model: connectionId, conversationId: reqConversationId, parentMessageId, analyticsModel } = req.body;

        // Also support legacy format: question, connectionId
        const question = text || req.body.question;
        const actualConnectionId = connectionId || req.body.connectionId;

        logger.info('[Analytics Chat] Parsed request:', {
            question: question?.substring(0, 100),
            connectionId: actualConnectionId,
            conversationId: reqConversationId,
            hasQuestion: !!question,
            hasConnectionId: !!actualConnectionId,
            analyticsModel: analyticsModel || 'NOT PROVIDED', // ⭐ Debug: Log analyticsModel from request
        });
        // ⭐ Debug: Console log for easier debugging
        console.log('[Analytics Chat Route] Request received:', {
            connectionId: actualConnectionId,
            analyticsModel: analyticsModel || 'NOT PROVIDED',
            hasAnalyticsModel: !!analyticsModel,
            reqBodyKeys: Object.keys(req.body),
        });

        if (!question || !actualConnectionId) {
            logger.warn('[Analytics Chat] Missing required fields:', { question: !!question, connectionId: !!actualConnectionId });
            return res.status(400).json({ error: 'Text/question and connectionId (model) are required' });
        }

        logger.info('[Analytics Chat] Validation passed, getting userId');
        const userId = req.user.id;
        logger.info('[Analytics Chat] UserId:', userId);

        // Generate conversationId
        const conversationId = !reqConversationId || reqConversationId === 'new'
            ? crypto.randomUUID()
            : reqConversationId;

        // Use conversationId as streamId for analytics to keep it simple
        const streamId = conversationId;
        logger.info('[Analytics Chat] Generated IDs:', { conversationId, streamId });

        // Create job for streaming
        logger.info('[Analytics Chat] Creating GenerationJob...');
        const job = await GenerationJobManager.createJob(streamId, userId, conversationId);
        logger.info('[Analytics Chat] Job created successfully:', { jobId: job?.id || 'unknown' });
        req._resumableStreamId = streamId;

        logger.info('[Analytics Chat] Sending response to client');
        // Send JSON response IMMEDIATELY so client can connect to SSE stream
        res.json({ streamId, conversationId, status: 'started' });
        logger.info('[Analytics Chat] Response sent, starting background processing');

        // Process request in background
        processAnalyticsRequestBackground({
            question,
            connectionId: actualConnectionId,
            conversationId,
            parentMessageId,
            userId,
            streamId,
            analyticsModel: analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free',
        }).catch((error) => {
            logger.error('[Analytics Chat] Error in background analytics processing:', error);
            GenerationJobManager.emitError(streamId, error.message || 'Failed to process analytics request');
            GenerationJobManager.completeJob(streamId, error.message);
        });

    } catch (error) {
        logger.error('Error starting analytics chat request:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error starting analytics request' });
        }
    }
});

/**
 * Process analytics request in background and emit results via SSE
 * Uses the synchronous logic but wraps it in SSE emission
 */
async function processAnalyticsRequestBackground(params) {
    const { streamId, userId, conversationId, question, connectionId, analyticsModel } = params;
    const startTime = Date.now();

    logger.info('[Analytics Chat] Background processing started:', {
        streamId,
        connectionId,
        analyticsModel: analyticsModel || 'NOT PROVIDED', // ⭐ Debug: Log analyticsModel received
    });
    // ⭐ Debug: Console log for easier debugging
    console.log('[Analytics Chat Background] Processing started:', {
        streamId,
        connectionId,
        analyticsModel: analyticsModel || 'NOT PROVIDED',
        hasAnalyticsModel: !!analyticsModel,
    });

    try {
        // Reuse the synchronous logic
        const result = await processAnalyticsRequestSync({ ...params, startTime });

        logger.info('[Analytics Chat] Background processing complete, emitting results:', {
            streamId,
            success: result.success,
            hasResults: !!result.results
        });

        // Save conversation to DB to ensure history works and gen_title succeeds
        try {
            const title = question.length > 50 ? question.substring(0, 50) + '...' : question;
            // Mock request object for saveConvo since we are in background
            const mockReq = { user: { id: userId } };

            await saveConvo(mockReq, {
                conversationId,
                title,
                endpoint: 'analytics',
                model: connectionId, // analytics uses connectionId as model
                user: userId,
            }, { context: 'Analytics Chat Background Save' });

            // Populate title cache to prevent 404 on gen_title
            const titleCache = getLogStores(CacheKeys.GEN_TITLE);
            const key = `${userId}-${conversationId}`;
            await titleCache.set(key, title);
            logger.debug(`[Analytics Chat] Saved conversation and populated title cache: ${title}`);
        } catch (saveError) {
            logger.error('[Analytics Chat] Error saving conversation/title:', saveError);
            // Non-fatal, continue emitting results
        }

        // Check for success
        if (!result.success && result.error) {
            // Emit error message
            GenerationJobManager.emitChunk(streamId, {
                event: 'message',
                data: { ...result, text: result.error },
            });

            // Emit final event with error
            GenerationJobManager.emitChunk(streamId, {
                event: 'message',
                data: { ...result, text: result.error, final: true },
            });
        } else {
            // Success case - emit results

            const responseData = {
                ...result,
                // Match useResumableSSE structure expectation
                message: {
                    messageId: result.messageId,
                    parentMessageId: result.parentMessageId,
                    conversationId: result.conversationId,
                },
                conversation: { conversationId: result.conversationId },
                // OPTIMIZATION: Only send explanation in text field to avoid duplicating large results in SSE payload
                // The frontend receives the full 'results' object for data rendering
                text: result.explanation || 'Analytics query executed successfully',
            };

            // Emit message event
            GenerationJobManager.emitChunk(streamId, {
                event: 'message',
                data: responseData,
            });

            // Emit final event
            GenerationJobManager.emitChunk(streamId, {
                event: 'message',
                data: {
                    ...responseData,
                    final: true,
                    conversation: { conversationId: result.conversationId }
                },
            });
        }

        logger.info('[Analytics Chat] Completing job:', { streamId });
        GenerationJobManager.completeJob(streamId);

    } catch (error) {
        logger.error('[Analytics Chat] Uncaught error in background processing:', error);
        GenerationJobManager.emitError(streamId, error.message);
        GenerationJobManager.completeJob(streamId, error.message);
    }
}

/**
 * Process analytics request synchronously and return results
 */
async function processAnalyticsRequestSync({
    question,
    connectionId,
    conversationId,
    parentMessageId,
    userId,
    startTime,
    analyticsModel,
}) {
    logger.info('[Analytics Process Sync] Starting request processing:', {
        connectionId,
        conversationId,
        question: question?.substring(0, 100),
    });

    try {
        // Get the database connection with credentials
        logger.info('[Analytics Process Sync] Fetching connection from database:', { connectionId });
        
        // Check if this is the sample database
        let connection;
        let schema;
        let isSampleDb = false;
        
        if (connectionId === 'sample-db') {
            connection = getSampleDbWithCredentials();
            if (!connection) {
                throw new Error('Sample database is not configured');
            }
            isSampleDb = true;
            // Always extract fresh schema for sample DB
            logger.info('[Analytics Process Sync] Extracting schema from sample database...');
            schema = await extractSampleDbSchema();
            if (!schema) {
                throw new Error('Failed to extract schema from sample database');
            }
        } else {
            connection = await DatabaseConnection.findById(connectionId).select(
                '+password +sslCertificate',
            );

            if (!connection) {
                throw new Error('Database connection not found');
            }

            if (!connection.isActive) {
                throw new Error('Database connection is inactive');
            }

            // Get or refresh schema if needed
            schema = connection.cachedSchema;
            const schemaAge = connection.schemaCachedAt
                ? Date.now() - connection.schemaCachedAt.getTime()
                : Infinity;

            // Refresh schema if older than 24 hours or not cached
            if (!schema || schemaAge > 24 * 60 * 60 * 1000) {
                logger.info('[Analytics Process Sync] Extracting schema...');
                const decryptedPassword = decryptCredentials(connection.password);

                schema = await extractSchemaAndStoreEmbeddings({
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
                }, connectionId);

                // Update cached schema
                connection.cachedSchema = schema;
                connection.schemaCachedAt = new Date();
                await connection.save();
                logger.info('[Analytics Process Sync] Schema cache updated');
            }
        }

        // Generate SQL query using OpenAI
        const selectedModelForLLM = analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';
        logger.info('[Analytics Process Sync] Generating SQL query with model:', {
            analyticsModel: analyticsModel || 'NOT PROVIDED',
            envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
            selectedModel: selectedModelForLLM, // ⭐ Debug: Log the model that will be used
        });
        // ⭐ Debug: Console log for easier debugging
        console.log('[Analytics Process Sync] About to call generateSqlQuery:', {
            analyticsModel: analyticsModel || 'NOT PROVIDED',
            envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
            selectedModel: selectedModelForLLM,
            databaseType: connection.type,
        });
        const { sql, explanation, tokensUsed } = await generateSqlQuery({
            question,
            schema,
            databaseType: connection.type,
            queryMode: connection.queryMode,
            model: selectedModelForLLM,
        });

        // If SQL generation failed, return error
        if (!sql) {
            const errorMessage = explanation || 'Failed to generate SQL query';
            logger.warn('[Analytics Process Sync] SQL generation failed:', errorMessage);

            return {
                messageId: uuidv4(),
                conversationId,
                parentMessageId: parentMessageId || null,
                generatedSql: null,
                explanation: errorMessage,
                results: null,
                error: errorMessage,
                success: false,
                totalTimeMs: Date.now() - startTime,
            };
        }

        const messageId = uuidv4();

        // Create the analytics query record
        const analyticsQuery = new AnalyticsQuery({
            user: userId,
            conversationId,
            messageId,
            connectionId: connection._id,
            question,
            generatedSql: sql,
            userApproved: true,
            tokensUsed,
            success: false,
        });

        let results = null;
        let error = null;

        // Execute the query
        logger.info('[Analytics Process Sync] Executing SQL query...');
        try {
            const decryptedPassword = decryptCredentials(connection.password);

            results = await executeQuery({
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
                sql,
                queryMode: connection.queryMode,
                timeout: connection.queryTimeout,
                maxRows: connection.maxRows,
            });

            logger.info('[Analytics Process Sync] Query executed successfully:', {
                rowCount: results.rowCount,
                executionTimeMs: results.executionTimeMs,
            });

            analyticsQuery.executedSql = sql;
            analyticsQuery.executionTimeMs = results.executionTimeMs;
            analyticsQuery.rowCount = results.rowCount;
            analyticsQuery.results = results.rows;
            analyticsQuery.success = true;
        } catch (execError) {
            // Extract detailed error message
            let errorMessage = execError.message;
            
            // If it's a DatabaseError, use its detailed message
            if (execError instanceof DatabaseError || execError.name === 'DatabaseError') {
                errorMessage = execError.getUserMessage ? execError.getUserMessage() : execError.message;
                logger.error('[Analytics Process Sync] Database error:', {
                    message: execError.message,
                    code: execError.code,
                    sqlState: execError.sqlState,
                    isSyntaxError: execError.isSyntaxError,
                });
            } else {
                logger.error('[Analytics Process Sync] Error executing query:', execError);
            }
            
            error = errorMessage;
            analyticsQuery.error = error;
        }

        await analyticsQuery.save();

        const totalTime = Date.now() - startTime;

        // Return the response object (to be emitted via SSE)
        return {
            messageId,
            conversationId,
            parentMessageId: parentMessageId || null,
            generatedSql: sql,
            explanation,
            results: results
                ? {
                    columns: results.columns,
                    rows: results.rows,
                    rowCount: results.rowCount,
                    executionTimeMs: results.executionTimeMs,
                    truncated: results.truncated,
                    suggestedChartType: results.suggestedChartType,
                }
                : null,
            error,
            success: !error,
            totalTimeMs: totalTime,
        };
    } catch (error) {
        logger.error('[Analytics Process Sync] Error:', error);

        return {
            messageId: uuidv4(),
            conversationId,
            parentMessageId: parentMessageId || null,
            generatedSql: null,
            explanation: null,
            results: null,
            error: error.message,
            success: false,
            totalTimeMs: Date.now() - startTime,
        };
    }
}

/**
 * @route POST /api/analytics/chat/execute
 * @desc Execute a specific SQL query (for user-modified queries)
 * @access Private
 */
router.post('/execute', enforceQueryLimit, async (req, res) => {
    try {
        const { sql, connectionId, messageId, conversationId } = req.body;

        if (!sql || !connectionId) {
            return res.status(400).json({ error: 'SQL and connectionId are required' });
        }

        // Get the database connection with credentials
        let connection;
        
        if (connectionId === 'sample-db') {
            connection = getSampleDbWithCredentials();
            if (!connection) {
                return res.status(404).json({ error: 'Sample database is not configured' });
            }
        } else {
            connection = await DatabaseConnection.findById(connectionId).select(
                '+password +sslCertificate',
            );

            if (!connection) {
                return res.status(404).json({ error: 'Database connection not found' });
            }

            if (!connection.isActive) {
                return res.status(400).json({ error: 'Database connection is inactive' });
            }
        }

        // Decrypt password if needed (sample DB password is not encrypted)
        let password = connection.password;
        if (connectionId !== 'sample-db') {
            password = decryptCredentials(connection.password);
        }

        const results = await executeQuery({
            type: connection.type,
            host: connection.host,
            port: connection.port,
            database: connection.database,
            username: connection.username,
            password: password,
            ssl: connection.ssl,
            sslCertificate: connection.sslCertificate
                ? (connectionId === 'sample-db' 
                    ? connection.sslCertificate 
                    : decryptCredentials(connection.sslCertificate))
                : undefined,
            sql,
            queryMode: connection.queryMode,
            timeout: connection.queryTimeout,
            maxRows: connection.maxRows,
        });

        // Update or create the analytics query record
        if (messageId) {
            // Update existing record if messageId provided
            await AnalyticsQuery.findOneAndUpdate(
                { messageId },
                {
                    executedSql: sql,
                    executionTimeMs: results.executionTimeMs,
                    rowCount: results.rowCount,
                    results: results.rows,
                    success: true,
                    userApproved: true,
                },
            );
        } else if (conversationId) {
            // Create new record for manual SQL executor queries
            const newMessageId = uuidv4();
            
            const analyticsQuery = new AnalyticsQuery({
                user: req.user.id,
                conversationId: conversationId,
                messageId: newMessageId,
                connectionId: connection._id,
                question: sql, // Use SQL as question for manual queries
                generatedSql: sql,
                executedSql: sql,
                executionTimeMs: results.executionTimeMs,
                rowCount: results.rowCount,
                results: results.rows,
                success: true,
                userApproved: true,
            });
            
            await analyticsQuery.save();
        }

        // Increment query count after successful execution (only for AI-generated queries, not manual SQL editor queries)
        if (messageId) {
            await subscriptionService.incrementQueryCount(req.user.id).catch((error) => {
                logger.error('[Analytics Chat] Failed to increment query count:', error);
                // Don't fail the request if count increment fails
            });
        }

        res.status(200).json({
            results: {
                columns: results.columns,
                rows: results.rows,
                rowCount: results.rowCount,
                executionTimeMs: results.executionTimeMs,
                truncated: results.truncated,
                suggestedChartType: results.suggestedChartType,
            },
            success: true,
        });
    } catch (error) {
        logger.error('Error executing analytics query:', error);
        
        // Return structured error response with detailed information
        const errorResponse = {
            success: false,
            error: error.message || 'Error executing query',
        };
        
        // Include additional error details if available
        if (error instanceof DatabaseError || error.name === 'DatabaseError') {
            errorResponse.errorDetails = {
                code: error.code,
                sqlState: error.sqlState,
                databaseType: error.databaseType,
                isSyntaxError: error.isSyntaxError,
                isPermissionError: error.isPermissionError,
                isConnectionError: error.isConnectionError,
                isTimeoutError: error.isTimeoutError,
            };
            
            // Set appropriate HTTP status code based on error type
            let statusCode = 500;
            if (error.isSyntaxError) {
                statusCode = 400; // Bad Request - syntax error is client-side issue
            } else if (error.isPermissionError) {
                statusCode = 403; // Forbidden
            } else if (error.isConnectionError) {
                statusCode = 503; // Service Unavailable - can't connect to database
            } else if (error.isTimeoutError) {
                statusCode = 504; // Gateway Timeout
            }
            
            return res.status(statusCode).json(errorResponse);
        }
        
        // For validation errors, return 400
        if (error.isValidationError) {
            return res.status(400).json(errorResponse);
        }
        
        res.status(500).json(errorResponse);
    }
});

/**
 * @route GET /api/analytics/chat/history/:conversationId
 * @desc Get analytics query history for a conversation
 * @access Private
 */
router.get('/history/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50 } = req.query;

        const queries = await AnalyticsQuery.find({
            user: req.user.id,
            conversationId,
        })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit, 10))
            .select('-results'); // Exclude large result sets

        res.status(200).json(queries);
    } catch (error) {
        logger.error('Error fetching analytics history:', error);
        res.status(500).json({ error: 'Error fetching analytics history' });
    }
});

/**
 * @route GET /api/analytics/chat/query/:messageId
 * @desc Get analytics query by messageId (used for chart creation to get SQL and connectionId)
 * @access Private
 */
router.get('/query/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;

        const query = await AnalyticsQuery.findOne({
            user: req.user.id,
            messageId,
        }).select('connectionId generatedSql executedSql conversationId messageId success');

        if (!query) {
            return res.status(404).json({ error: 'Analytics query not found' });
        }

        res.status(200).json({
            connectionId: query.connectionId,
            sql: query.executedSql || query.generatedSql,
            messageId: query.messageId,
            conversationId: query.conversationId,
        });
    } catch (error) {
        logger.error('Error fetching analytics query:', error);
        res.status(500).json({ error: 'Error fetching analytics query' });
    }
});

module.exports = router;
