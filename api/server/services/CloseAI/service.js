const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { DatabaseConnection } = require('~/db/models');
const { decryptCredentials } = require('~/server/services/Analytics/encryption');
const { generateSqlQuery } = require('~/server/services/Analytics/queryGenerator');
const { executeQuery } = require('~/server/services/Analytics/queryExecutor');
const { extractSchema } = require('~/server/services/Analytics/connectionService');
const {
  getSampleDbWithCredentials,
  extractSampleDbSchema,
} = require('~/server/services/Analytics/sampleDbService');
const subscriptionService = require('~/server/services/SubscriptionService');
const { processAnalyticsWithAgent } = require('./agentProcessor');
const { orchestrate } = require('~/server/services/Analytics/agentOrchestrator');
const { runReActAgent, runReActAgentWithRecovery } = require('./reactAgent');
const {
  summarizeConversationHistory,
  buildContextWithSummary,
} = require('~/server/services/Analytics/chatSummarizer');

/**
 * CloseAI Backend Service
 * Mimics OpenAI's API response format for chat completions
 *
 * Note: Sample DB schema is cached by Analytics/sampleDbService.js (24h TTL)
 */

/**
 * Check if a string is a valid MongoDB ObjectId (connection ID)
 * @param {string} str - String to check
 * @returns {boolean} - True if valid ObjectId
 */
function isValidObjectId(str) {
  return mongoose.Types.ObjectId.isValid(str) && str.length === 24;
}

/**
 * Check if a string is a valid connection identifier (ObjectId or 'sample-db')
 * @param {string} str - String to check
 * @returns {boolean} - True if valid connection ID
 */
function isValidConnectionId(str) {
  return isValidObjectId(str) || str === 'sample-db';
}

/**
 * Process analytics request for a database connection
 * @param {string} connectionId - Database connection ID
 * @param {string} question - User's question
 * @param {string} analyticsModel - Selected LLM model for SQL generation (optional)
 * @returns {Promise<Object>} - Analytics results
 */

// Constants
const SCHEMA_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const MAX_DISPLAY_ROWS = 50;
const QUERY_TIMEOUT_MS = 30000;
const MAX_QUERY_ROWS = 1000;

/**
 * Get database connection and schema
 */
async function getConnectionAndSchema(connectionId, userId) {
  if (connectionId === 'sample-db') {
    return await getSampleConnection();
  }
  return await getRegularConnection(connectionId, userId);
}

/**
 * Handle sample database connection
 */
async function getSampleConnection() {
  const connection = getSampleDbWithCredentials();
  if (!connection) {
    throw new Error('Sample database is not configured');
  }

  logger.info('[CloseAI Analytics] Getting schema from sample database...');
  const schema = await extractSampleDbSchema();
  if (!schema) {
    throw new Error('Failed to extract schema from sample database');
  }

  return {
    connection,
    schema,
    isSampleDb: true,
  };
}

/**
 * Handle regular database connection with authorization
 */
async function getRegularConnection(connectionId, userId) {
  const connection = await DatabaseConnection.findById(connectionId).select(
    '+password +sslCertificate',
  );

  if (!connection) {
    throw new Error('Database connection not found');
  }

  if (!connection.isActive) {
    throw new Error('Database connection is inactive');
  }

  // Authorization check
  if (userId && connection.createdBy && connection.createdBy.toString() !== userId.toString()) {
    logger.warn('[CloseAI Analytics] Unauthorized access attempt:', {
      connectionId,
      userId,
      ownerId: connection.createdBy,
    });
    throw new Error('Unauthorized: You do not have permission to access this database connection');
  }

  const schema = await getOrRefreshSchema(connection, connectionId, userId);

  return {
    connection,
    schema,
    isSampleDb: false,
  };
}

/**
 * Get cached schema or refresh if stale
 */
async function getOrRefreshSchema(connection, connectionId, userId) {
  const schemaAge = connection.schemaCachedAt
    ? Date.now() - connection.schemaCachedAt.getTime()
    : Infinity;

  // Return cached schema if fresh
  if (connection.cachedSchema && schemaAge <= SCHEMA_CACHE_TTL_MS) {
    return connection.cachedSchema;
  }

  // Extract fresh schema
  logger.info('[CloseAI Analytics] Extracting schema...');
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

  // Update cache
  connection.cachedSchema = schema;
  connection.schemaCachedAt = new Date();
  await connection.save();
  logger.info('[CloseAI Analytics] Schema cache updated');

  // Embed schema documentation asynchronously (keep original pattern)
  if (userId) {
    const {
      generateSchemaDocumentation,
      embedSchemaDocumentation,
      deleteSchemaDocumentation,
    } = require('~/server/services/Analytics/schemaDocumentationRAG');

    (async () => {
      try {
        await deleteSchemaDocumentation(connectionId, userId);

        const chunks = generateSchemaDocumentation(schema, connectionId, connection.type);
        if (chunks.length > 0) {
          await embedSchemaDocumentation(chunks, userId);
          logger.info('[CloseAI Analytics] Schema documentation embedded');
        }
      } catch (error) {
        logger.warn('[CloseAI Analytics] Failed to embed schema documentation:', error);
      }
    })();
  }

  return schema;
}

/**
 * Select which model to use for SQL generation
 */
function selectAnalyticsModel(analyticsModel) {
  const selectedModel =
    analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';

  console.log('[CloseAI Analytics] Model selection:', {
    analyticsModel: analyticsModel || 'NOT PROVIDED',
    envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
    selectedModel,
  });

  logger.info('[CloseAI Analytics] Generating SQL query with model:', {
    analyticsModel: analyticsModel || 'NOT PROVIDED',
    envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
    selectedModel,
  });

  return selectedModel;
}

/**
 * Execute SQL query against the database
 */
async function executeAnalyticsQuery(connection, sql, isSampleDb) {
  logger.info('[CloseAI Analytics] Executing SQL query...');

  const queryPassword = isSampleDb ? connection.password : decryptCredentials(connection.password);

  const sslCertificate = isSampleDb
    ? connection.sslCertificate
    : connection.sslCertificate
      ? decryptCredentials(connection.sslCertificate)
      : undefined;

  return await executeQuery({
    type: connection.type,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    password: queryPassword,
    ssl: connection.ssl,
    sslCertificate,
    sql,
    queryMode: connection.queryMode || 'read_only',
    timeout: QUERY_TIMEOUT_MS,
    maxRows: MAX_QUERY_ROWS,
  });
}

/**
 * Format query results as markdown text
 */
function formatQueryResponse(queryResult, sql, explanation) {
  let responseText = '';

  // Add explanation
  if (explanation) {
    responseText += `${explanation}\n\n`;
  }

  // Add SQL query
  if (sql) {
    responseText += `**Generated SQL Query:**\n\`\`\`sql\n${sql}\n\`\`\`\n\n`;
  }

  // Add results
  if (queryResult.columns && queryResult.columns.length > 0) {
    responseText += formatResultsTable(queryResult);
  } else {
    responseText += 'Query executed successfully (no results returned).';
  }

  return responseText;
}

/**
 * Format query results as a markdown table
 */
function formatResultsTable(queryResult) {
  let tableText = `**Query Results:**\n\n`;

  // Table headers
  const headers = queryResult.columns.map((col) => col.name).join(' | ');
  tableText += `| ${headers} |\n`;
  tableText += `|${queryResult.columns.map(() => '---').join('|')}|\n`;

  // Table rows (limit display)
  const displayRows = queryResult.rows.slice(0, MAX_DISPLAY_ROWS);
  displayRows.forEach((row) => {
    const values = queryResult.columns
      .map((col) => {
        const value = row[col.name];
        return value !== null && value !== undefined ? String(value) : 'NULL';
      })
      .join(' | ');
    tableText += `| ${values} |\n`;
  });

  // Add footer notes
  if (queryResult.rowCount > MAX_DISPLAY_ROWS) {
    tableText += `\n*Showing first ${MAX_DISPLAY_ROWS} of ${queryResult.rowCount} rows${queryResult.truncated ? ' (truncated)' : ''}*\n`;
  } else if (queryResult.truncated) {
    tableText += `\n*Results truncated at ${queryResult.rowCount} rows*\n`;
  }

  if (queryResult.executionTimeMs) {
    tableText += `\n*Query executed in ${(queryResult.executionTimeMs / 1000).toFixed(2)}s*\n`;
  }

  return tableText;
}

/**
 * Track query usage for the user
 */
async function trackQueryUsage(userId, connection) {
  try {
    const usageUserId = userId || connection.createdBy?.toString() || connection.createdBy;

    if (usageUserId) {
      await subscriptionService.incrementQueryCount(usageUserId);
      logger.info('[CloseAI Analytics] Incremented query count for user:', usageUserId);
    } else {
      logger.warn('[CloseAI Analytics] No userId found in params or connection.createdBy');
    }
  } catch (error) {
    logger.error('[CloseAI Analytics] Error incrementing query count:', error);
    // Don't fail the request if usage tracking fails
  }
}

/**
 * Main function to process analytics requests
 */
async function processAnalyticsRequest(connectionId, question, analyticsModel, userId) {
  console.log('[CloseAI Analytics] Processing request:', {
    connectionId,
    analyticsModel: analyticsModel || 'NOT PROVIDED',
    hasAnalyticsModel: !!analyticsModel,
  });

  logger.info('[CloseAI Analytics] Processing analytics request:', {
    connectionId,
    question: question?.substring(0, 100),
    analyticsModel: analyticsModel || 'NOT PROVIDED',
  });

  try {
    // Get database connection and schema
    const { connection, schema, isSampleDb } = await getConnectionAndSchema(connectionId, userId);

    // Select model for SQL generation
    const selectedModelForLLM = selectAnalyticsModel(analyticsModel);

    // Generate SQL query
    console.log('[CloseAI Analytics] About to call generateSqlQuery:', {
      analyticsModel: analyticsModel || 'NOT PROVIDED',
      envModel: process.env.ANALYTICS_OPENAI_MODEL || 'NOT SET',
      selectedModel: selectedModelForLLM,
      databaseType: connection.type,
    });

    logger.info('[CloseAI Analytics] Generating SQL query...');
    const { sql, explanation, tokensUsed } = await generateSqlQuery({
      question,
      schema,
      databaseType: connection.type,
      queryMode: connection.queryMode || 'read_only',
      model: selectedModelForLLM,
      connectionId,
      userId,
    });

    if (!sql) {
      return {
        success: false,
        error: explanation || 'Failed to generate SQL query',
        explanation,
      };
    }

    // Execute the query
    const queryResult = await executeAnalyticsQuery(connection, sql, isSampleDb);

    // Format response
    const responseText = formatQueryResponse(queryResult, sql, explanation);

    // Track usage
    await trackQueryUsage(userId, connection);

    return {
      success: true,
      text: responseText,
      explanation,
      sql,
      results: queryResult,
      tokensUsed,
    };
  } catch (error) {
    logger.error('[CloseAI Analytics] Error processing analytics request:', error);
    return {
      success: false,
      error: error.message || 'Failed to process analytics request',
    };
  }
}

// Keep original exports - add any other functions that were exported
module.exports = processAnalyticsRequest;

/**
 * Generate a dummy response that mimics OpenAI's streaming format
 * @param {string} userMessage - The user's message
 * @param {string} model - The model name (e.g., 'gpt-5.2')
 * @returns {string} - A dummy response text
 */
function generateDummyResponse(userMessage, model = 'gpt-5.2') {
  // Simple dummy response - you can replace this with your actual AI logic later
  return `This is a dummy response from CloseAI (${model}) backend service.\n\nYou asked: "${userMessage}"\n\nThis is where your custom AI logic would generate the actual response.`;
}

/**
 * Build detailed reasoning content from agent event
 * Creates rich, contextual descriptions of what the agent is doing
 * @param {Object} event - The event data (tool call, thinking, etc.)
 * @returns {string} - Formatted reasoning content
 */
function buildReasoningContent(event) {
  const { type, tool, status, message, step, error, result } = event;

  // Tool call events - provide detailed context about tool usage
  if (type === 'tool_call' && tool) {
    const toolDescriptions = {
      get_db_connection: {
        starting: 'Connecting to the database to access your data...',
        completed: 'Successfully established database connection.',
        error: 'Failed to connect to the database.',
      },
      check_schema_cache: {
        starting: 'Checking if database schema information is already cached...',
        completed: 'Schema cache check completed.',
        error: 'Error checking schema cache.',
      },
      retrieving_schema: {
        starting: 'Retrieving database schema to understand table structures...',
        completed: 'Retrieved schema information for relevant tables.',
        error: 'Failed to retrieve database schema.',
      },
      extract_schema: {
        starting: 'Extracting detailed schema information from the database...',
        completed: 'Successfully extracted schema details.',
        error: 'Error extracting schema information.',
      },
      list_available_tables: {
        starting: 'Listing all available tables in the database...',
        completed: `Found ${result?.tableCount || 'multiple'} tables available.`,
        error: 'Failed to list database tables.',
      },
      select_relevant_tables: {
        starting: 'Analyzing your question to identify relevant tables...',
        completed: `Identified relevant tables for this query.`,
        error: 'Failed to select relevant tables.',
      },
      extract_schema_for_tables: {
        starting: 'Extracting detailed schema for the selected tables...',
        completed: 'Retrieved schema details for relevant tables.',
        error: 'Failed to extract schema for tables.',
      },
      generate_sql_query: {
        starting: 'Generating SQL query based on your question and the database schema...',
        completed: 'SQL query generated successfully.',
        error: 'Failed to generate SQL query.',
      },
      execute_sql_query: {
        starting: 'Executing SQL query and auto-formatting results...',
        completed: 'Query executed and results formatted successfully.',
        error: 'Query execution failed.',
      },
      fix_sql_error: {
        starting: 'Detected an error in the SQL query. Analyzing and fixing...',
        completed: 'Successfully fixed the SQL query error.',
        error: 'Unable to automatically fix the SQL error.',
      },
      format_results: {
        starting: 'Formatting query results into a readable response...',
        completed: 'Results formatted successfully.',
        error: 'Error formatting results.',
      },
    };

    const desc = toolDescriptions[tool];
    if (desc) {
      if (status === 'starting') return desc.starting;
      if (status === 'completed') {
        return error ? desc.error : desc.completed;
      }
    }

    // Fallback for unknown tools
    if (status === 'starting') return `Starting: ${tool}...`;
    if (status === 'completed') {
      return error ? `Error in ${tool}: ${error}` : `Completed: ${tool}`;
    }
  }

  // Thinking events - capture the agent's reasoning process
  if (type === 'thinking' && message) {
    return message;
  }

  return '';
}

/**
 * Stream reasoning/thinking content as structured data
 * This sends reasoning as a separate content type that the frontend can render specially
 * @param {ReadableStream} stream - The response stream to write to
 * @param {string} reasoningContent - The reasoning content to stream
 * @param {string} model - The model name
 * @param {string} completionId - The completion ID
 * @returns {Promise<void>}
 */
async function streamReasoningContent(stream, reasoningContent, model, completionId) {
  if (!reasoningContent || reasoningContent.trim().length === 0) {
    return;
  }

  // Send reasoning as a special "thinking" content type
  // This mimics how o1/o3 models stream their reasoning
  const reasoningChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          // Use a special format that the frontend can recognize as reasoning
          // We'll wrap it in <think> tags which the Reasoning component expects
          content: `<think>${reasoningContent}</think>`,
        },
        finish_reason: null,
      },
    ],
  };

  stream.write(`data: ${JSON.stringify(reasoningChunk)}\n\n`);
  if (typeof stream.flush === 'function') {
    stream.flush();
  }

  // Add small delay for visibility
  const agentEventDelayMs = parseInt(process.env.CLOSEAI_AGENT_EVENT_DELAY_MS || '50', 10);
  await new Promise((resolve) => setTimeout(resolve, agentEventDelayMs));
}

/**
 * Stream agent event (tool call, thinking) in OpenAI-compatible format
 * Now streams detailed reasoning content instead of hardcoded messages
 * @param {ReadableStream} stream - The response stream to write to
 * @param {Object} event - The event data (tool call, thinking, etc.)
 * @param {string} model - The model name
 * @param {string} completionId - The completion ID
 * @returns {Promise<void>}
 */
async function streamAgentEvent(stream, event, model, completionId) {
  const reasoningContent = buildReasoningContent(event);

  if (!reasoningContent) {
    return;
  }

  console.log(`[streamAgentEvent] Streaming reasoning:`, {
    type: event.type,
    tool: event.tool,
    status: event.status,
    contentPreview: reasoningContent.substring(0, 100),
  });

  // Stream the detailed reasoning content
  await streamReasoningContent(stream, reasoningContent, model, completionId);
}

/**
 * Stream a response in OpenAI-compatible format
 * @param {ReadableStream} stream - The response stream to write to
 * @param {string} text - The text to stream
 * @param {string} model - The model name
 * @param {string} completionId - The completion ID
 */
async function streamOpenAIFormat(stream, text, model, completionId) {
  const chunks = text.split(' ');
  const streamDelayMsRaw = process.env.CLOSEAI_STREAM_DELAY_MS;
  const streamDelayMs = Number.isFinite(Number(streamDelayMsRaw))
    ? Math.max(0, Number(streamDelayMsRaw))
    : 3;

  // Send initial chunk
  const initialChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null,
      },
    ],
  };
  stream.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
  if (typeof stream.flush === 'function') {
    stream.flush();
  }

  // Stream text chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
    const chunkData = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          delta: { content: chunk },
          finish_reason: null,
        },
      ],
    };
    stream.write(`data: ${JSON.stringify(chunkData)}\n\n`);
    if (typeof stream.flush === 'function') {
      stream.flush();
    }
    await new Promise((resolve) => setTimeout(resolve, streamDelayMs)); // Simulate streaming delay
  }

  // Send final chunk
  const finalChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
      },
    ],
  };
  stream.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  if (typeof stream.flush === 'function') {
    stream.flush();
  }

  // Send done signal
  stream.write('data: [DONE]\n\n');
  if (typeof stream.flush === 'function') {
    stream.flush();
  }
  stream.end();
}

/**
 * Handle CloseAI chat completion request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleCloseAIChatCompletion(req, res) {
  try {
    // ⭐ Extract analyticsModel and agentType from req.body (set by CloseAI route handler)
    // The route handler extracts it from header or endpointOption and sets it here
    const {
      messages,
      model = 'gpt-5.2',
      stream = true,
      analyticsModel: analyticsModelFromBody,
      agentType: agentTypeFromBody,
    } = req.body;
    console.log('🌟🌟🌟🌟🌟🌟🌟🌟1st step message recieved.🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟');
    // ⭐ Also check req.body.analyticsModel in case it's set elsewhere
    const analyticsModel = analyticsModelFromBody || req.body?.analyticsModel || null;
    // ⭐ Get agentType from request or fallback to environment variable
    const agentType = agentTypeFromBody || req.body?.agentType || process.env.AGENT_TYPE || 'react';

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Extract user message - handle both string and object content
    const extractTextFromMessage = (msg) => {
      if (typeof msg.content === 'string') {
        return msg.content;
      } else if (Array.isArray(msg.content)) {
        // Handle array content (e.g., [{ type: 'text', text: '...' }])
        return msg.content
          .map((part) => {
            if (typeof part === 'string') {
              return part;
            } else if (part.type === 'text' && part.text) {
              return part.text;
            } else if (part.text) {
              return part.text;
            }
            return '';
          })
          .filter((text) => text)
          .join(' ');
      } else if (msg.content && typeof msg.content === 'object') {
        // Handle object content
        return msg.content.text || msg.content.content || JSON.stringify(msg.content);
      }
      return '';
    };

    // For analytics, provide limited context from the last 2-3 messages to help with follow-ups
    // Use summarization for large conversation histories to save tokens
    const recentMessages = messages.slice(-10); // Last 10 messages (up to 5 exchanges)

    // Try to summarize conversation history if it's large
    let summaryResult = null;
    try {
      summaryResult = await summarizeConversationHistory(recentMessages, {
        currentQuestion: extractTextFromMessage(messages[messages.length - 1]),
      });
    } catch (error) {
      logger.warn(
        '[CloseAI Service] Chat summarization failed, using full context:',
        error.message,
      );
    }

    let userMessage;
    let chatHistoryForAgent = null;

    if (summaryResult && summaryResult.summary) {
      // Use summarized context for chat history, keep current message separate
      const currentContent = extractTextFromMessage(messages[messages.length - 1]) || '';
      userMessage = currentContent;
      chatHistoryForAgent = summaryResult.summary;
      logger.info('[CloseAI Service] Using summarized context:', {
        originalLength: summaryResult.originalLength,
        compressedLength: summaryResult.compressedLength,
        compressionRatio: summaryResult.compressionRatio,
      });
    } else {
      // Fallback to original behavior: include both user and assistant messages
      const historyMessages = recentMessages.slice(0, -1); // All except last
      const lastMessage = recentMessages[recentMessages.length - 1];

      // Build chat history from previous messages
      if (historyMessages.length > 0) {
        chatHistoryForAgent = historyMessages
          .map((msg) => {
            const role = msg.role === 'user' ? 'Human' : 'Assistant';
            const content = extractTextFromMessage(msg);
            return content ? `${role}: ${content}` : null;
          })
          .filter(Boolean)
          .join('\n');
      }

      // Current message is just the last user message
      userMessage = extractTextFromMessage(lastMessage) || '';
    }

    // Extract the latest user message for skill matching (without conversation context)
    // Find the last message with role 'user' from the original messages array
    let originalUserQuestion = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = extractTextFromMessage(messages[i]);
        if (content && content.trim().length > 0) {
          originalUserQuestion = content.trim();
          break;
        }
      }
    }

    // Fallback: if no user message found, use first part of userMessage
    if (!originalUserQuestion && userMessage) {
      const userMatch = userMessage.match(/User:\s*([^\n]+(?:\n(?!User:|Assistant:)[^\n]+)*)/i);
      if (userMatch) {
        originalUserQuestion = userMatch[1].trim();
      }
    }

    logger.info('[CloseAI Service] Processing request:', {
      model,
      messageLength: userMessage.length,
      originalUserQuestion: originalUserQuestion?.substring(0, 100),
      stream,
      isConnectionId: isValidConnectionId(model),
      analyticsModel: analyticsModel || 'NOT PROVIDED', // ⭐ Debug: Log analyticsModel
    });
    // ⭐ Debug: Console log for easier debugging
    console.log('[CloseAI Service]📒 Processing request:', {
      model,
      analyticsModel: analyticsModel || 'NOT PROVIDED',
      hasAnalyticsModel: !!analyticsModel,
      agentType: agentType || 'NOT PROVIDED',
      hasAgentType: !!agentType,
      isConnectionId: isValidConnectionId(model),
    });

    // Detect title generation requests - these should not be processed as analytics queries
    // Title generation prompts contain specific markers like "5-word-or-less title"
    const isTitleGenerationRequest =
      userMessage?.includes('5-word-or-less title') ||
      userMessage?.includes('title for the conversation');

    // Check if model is a connection ID (analytics connection)
    let responseText;
    const completionId = `chatcmpl-${uuidv4()}`;
    const useAgent = process.env.CLOSEAI_USE_AGENT !== 'false'; // Default to true
    // agentType is already extracted from request body at the beginning of the function

    console.log('[CloseAI Service] Agent type selected:', {
      agentType,
      fromRequest: !!agentTypeFromBody,
      fromEnv: !agentTypeFromBody && !!process.env.AGENT_TYPE,
    });

    if (isValidConnectionId(model) && isTitleGenerationRequest) {
      // Title generation requests for CloseAI conversations are mistakenly routed here
      // because the "model" (connection ID) matches an analytics connection.
      // The titleConvo() fix should prevent this, but this is a defensive fallback.
      logger.info(
        '[CloseAI Service] Detected title generation request, skipping analytics pipeline',
      );
      console.log('[CloseAI Service] Skipping analytics for title generation request');
      responseText = 'New Conversation';

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

        const initialChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }

        await streamOpenAIFormat(res, responseText, model, completionId);
      } else {
        res.json({
          id: completionId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: responseText,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: Math.ceil(userMessage.length / 4),
            completion_tokens: Math.ceil(responseText.length / 4),
            total_tokens: Math.ceil((userMessage.length + responseText.length) / 4),
          },
        });
      }
      return;
    } else if (isValidConnectionId(model)) {
      // This is an analytics connection - process analytics request
      logger.info('[CloseAI Service] Detected analytics connection, processing...', {
        useAgent,
      });

      if (stream) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        // Prevent proxy buffering and transformations (nginx, CDNs, compression middleware, etc.)
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

        // Send initial chunk
        const initialChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }

        // 🔌 AGENT starts from here 🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼🌼
        if (useAgent) {
          // Create callbacks for streaming agent events
          const onToolCall = async (event) => {
            logger.info('[CloseAI Service] Streaming tool call event:', {
              tool: event.tool,
              status: event.status,
            });
            await streamAgentEvent(
              res,
              {
                type: 'tool_call',
                ...event,
                timestamp: new Date().toISOString(),
              },
              model,
              completionId,
            );
          };

          const onThinking = async (event) => {
            logger.info('[CloseAI Service] Streaming thinking event:', { message: event.message });
            console.log('[CloseAI Service] Streaming thinking event:', { message: event.message });
            await streamAgentEvent(
              res,
              {
                type: 'thinking',
                ...event,
                timestamp: new Date().toISOString(),
              },
              model,
              completionId,
            );
          };

          if (agentType === 'react') {
            // Use LangChain ReAct Agent for self-orchestrating analytics
            logger.info('[CloseAI Service]🏗️ Using ReAct Agent (LangChain)');
            console.log('[CloseAI Service]🏗️ Using ReAct Agent (LangChain)');
            try {
              // Run ReAct Agent with recovery
              const agentResult = await runReActAgentWithRecovery({
                connectionId: model,
                message: userMessage,
                analyticsModel,
                onToolCall,
                onThinking,
                userId: req.user?.id,
                chatHistory: chatHistoryForAgent,
                originalQuestion: originalUserQuestion,
              });

              if (!agentResult.success) {
                responseText = `Error: ${agentResult.error || 'Failed to process request'}`;
                logger.error('[CloseAI Service] ReAct Agent failed:', agentResult.error);
              } else {
                responseText = agentResult.text || 'Request processed successfully.';
                // Log agent metrics
                logger.info('[CloseAI Service]✅ ReAct Agent completed:', {
                  iterations: agentResult.metrics?.iterations,
                  totalTimeMs: agentResult.metrics?.totalTimeMs,
                });
              }
            } catch (error) {
              logger.error('[CloseAI Service] Error in ReAct Agent:', error);
              // Fallback to traditional processing
              const analyticsResult = await processAnalyticsRequest(
                model,
                userMessage,
                analyticsModel,
                req.user?.id,
              );
              if (!analyticsResult.success) {
                responseText = `Error: ${analyticsResult.error || 'Failed to process analytics request'}`;
              } else {
                responseText =
                  analyticsResult.text ||
                  analyticsResult.explanation ||
                  'Query executed successfully.';
              }
            }
          } else {
            // Use legacy Agent Orchestrator
            logger.info('[CloseAI Service]🏗️ Using Agent Orchestrator (Legacy)');
            console.log('[CloseAI Service]🏗️ Using Agent Orchestrator (Legacy)');
            try {
              // Build conversation history from messages
              const conversationHistory = messages
                .slice(-6)
                .map((m) => ({
                  role: m.role,
                  content: extractTextFromMessage(m),
                }))
                .filter((m) => m.content);

              // Process with Agent Orchestrator
              const orchestratorResult = await orchestrate({
                connectionId: model,
                message: userMessage,
                analyticsModel,
                orchestratorModel: process.env.ORCHESTRATOR_MODEL || null,
                conversationHistory,
                onToolCall,
                onThinking,
                userId: req.user?.id,
                originalQuestion: originalUserQuestion,
              });

              if (!orchestratorResult.success) {
                responseText = `Error: ${orchestratorResult.error || 'Failed to process request'}`;
              } else {
                responseText = orchestratorResult.text || 'Request processed successfully.';
                logger.info('[CloseAI Service]🔌 Orchestrator routed to agent:', {
                  agentType: orchestratorResult.agentType,
                  classification: orchestratorResult.classification,
                });
              }
            } catch (error) {
              logger.error('[CloseAI Service] Error in Agent Orchestrator:', error);
              // Fallback to traditional processing
              const analyticsResult = await processAnalyticsRequest(
                model,
                userMessage,
                analyticsModel,
                req.user?.id,
              );
              if (!analyticsResult.success) {
                responseText = `Error: ${analyticsResult.error || 'Failed to process analytics request'}`;
              } else {
                responseText =
                  analyticsResult.text ||
                  analyticsResult.explanation ||
                  'Query executed successfully.';
              }
            }
          }
        } else {
          // Use traditional processing (non-agent)
          const analyticsResult = await processAnalyticsRequest(
            model,
            userMessage,
            analyticsModel,
            req.user?.id,
          );

          if (!analyticsResult.success) {
            responseText = `Error: ${analyticsResult.error || 'Failed to process analytics request'}`;
          } else {
            responseText =
              analyticsResult.text || analyticsResult.explanation || 'Query executed successfully.';
          }
        }

        // Stream the final response text
        await streamOpenAIFormat(res, responseText, model, completionId);
      } else {
        // Non-streaming: use traditional processing
        const analyticsResult = await processAnalyticsRequest(
          model,
          userMessage,
          analyticsModel,
          req.user?.id,
        );

        if (!analyticsResult.success) {
          responseText = `Error: ${analyticsResult.error || 'Failed to process analytics request'}`;
        } else {
          responseText =
            analyticsResult.text || analyticsResult.explanation || 'Query executed successfully.';
        }
      }
    } else {
      // Regular dummy response for gpt-5.2
      responseText = generateDummyResponse(userMessage, model);
    }

    if (stream) {
      // Already handled above for analytics connections (including sample-db)
      // For non-analytics, stream the response
      if (!isValidConnectionId(model)) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

        // Stream the response
        await streamOpenAIFormat(res, responseText, model, completionId);
      }
    } else {
      // Non-streaming response
      res.json({
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: Math.ceil(userMessage.length / 4),
          completion_tokens: Math.ceil(responseText.length / 4),
          total_tokens: Math.ceil((userMessage.length + responseText.length) / 4),
        },
      });
    }
  } catch (error) {
    logger.error('[CloseAI Service] Error handling request:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

module.exports = {
  handleCloseAIChatCompletion,
  generateDummyResponse,
};
