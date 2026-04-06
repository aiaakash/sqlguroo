const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const {
  getDbConnectionTool,
  checkSchemaCacheTool,
  extractSchemaTool,
  cacheSchemaTool,
  generateSqlQueryTool,
  executeSqlQueryTool,
  formatResultsTool,
  incrementQueryCountTool,
} = require('./analyticsTools');
const { extractSampleDbSchema } = require('../Analytics/sampleDbService');
const { storeTableNameEmbeddings } = require('../Analytics/embeddingService');

/**
 * Configuration constants for agent processing
 */
const CONFIG = {
  SCHEMA_TEXT_LIMIT: 3000,
  FIX_QUERY_MAX_TOKENS: 4000,
  MAX_EXECUTE_ATTEMPTS: 2,
  SQL_RESULT_LIMIT: 1000,
  SCHEMA_CACHE_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// Initialize OpenRouter client for query fixing
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

/**
 * Agent-based Analytics Processor
 * Orchestrates database analytics operations using tools
 * and streams tool calls and thinking to the frontend
 * 
 * This is a simplified "agent" that follows a deterministic workflow
 * but streams each step for visibility. In the future, this could be
 * replaced with a true LLM agent that decides the sequence.
 */

/**
 * Fix a failed SQL query using LLM
 * @param {string} originalSql - The SQL query that failed
 * @param {string} errorMessage - The error message from the database
 * @param {Object} schema - Database schema for context
 * @param {string} databaseType - Type of database (mysql, clickhouse, etc.)
 * @param {string} analyticsModel - LLM model to use for fixing
 * @param {string} question - Original user question for context
 * @returns {Promise<Object>} - { sql: string, explanation: string }
 */
async function fixQueryWithLLM(originalSql, errorMessage, schema, databaseType, analyticsModel, question) {
  try {
    const selectedModel = analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';
    const isOpenRouter = selectedModel.includes('/');
    
    const client = isOpenRouter ? openRouter : null;
    if (!client) {
      logger.warn('[FixQuery] Only OpenRouter models supported for query fixing');
      return null;
    }

    const schemaText = JSON.stringify(schema, null, 2).substring(0, CONFIG.SCHEMA_TEXT_LIMIT); // Limit schema size
    
    const systemPrompt = `You are an expert SQL debugger. Your task is to fix a SQL query that failed with an error.

Database Type: ${databaseType.toUpperCase()}

CRITICAL RULES:
1. Analyze the error message carefully and identify the root cause
2. Fix ONLY the specific issue causing the error
3. Return ONLY the corrected SQL query - no explanations, no markdown
4. Use table and column names EXACTLY as they exist in the schema
5. Ensure the query answers the original user question
6. Add appropriate LIMIT 1000 to prevent excessive results
7. Use proper ${databaseType} syntax

COMMON ERRORS AND FIXES:
- Unknown column: Check if column name is correct or use proper alias
- Syntax error: Check for missing quotes, commas, or parentheses
- Table doesn't exist: Verify table name matches schema exactly
- Ambiguous column: Add table alias prefix (e.g., t1.column_name)
- Invalid function: Use ${databaseType}-specific function names

Output format (MUST FOLLOW EXACTLY):
SQL: YOUR_CORRECTED_SQL_QUERY_HERE
EXPLANATION: Brief explanation of what was fixed

IMPORTANT: Do NOT wrap the SQL in markdown code blocks. Just write "SQL:" followed by the query on the same line.`;

    const userPrompt = `Original Question: ${question}

Failed SQL Query:
${originalSql}

Error Message:
${errorMessage}

Database Schema (relevant tables):
${schemaText}

Please fix the SQL query to resolve the error.`;

    logger.info('[FixQuery] Sending error to LLM for fixing', {
      model: selectedModel,
      errorPreview: errorMessage.substring(0, 100),
    });

    const response = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: CONFIG.FIX_QUERY_MAX_TOKENS,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Debug: Log what the LLM returned
    logger.debug('[FixQuery] LLM raw response:', {
      contentLength: content.length,
      contentPreview: content.substring(0, 500),
    });
    console.log('[FixQuery] LLM raw response:', content.substring(0, 1000));
    
    // Parse the response - try multiple strategies
    let fixedSql = null;
    let explanation = 'Fixed query error';
    
    // Strategy 1: Look for SQL: prefix
    const sqlMatch = content.match(/SQL:\s*([\s\S]*?)(?=\n\s*EXPLANATION:|$)/i);
    if (sqlMatch) {
      fixedSql = sqlMatch[1].trim();
    }
    
    // Strategy 2: Look for markdown code block with sql
    if (!fixedSql) {
      const codeBlockMatch = content.match(/```sql\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
        fixedSql = codeBlockMatch[1].trim();
      }
    }
    
    // Strategy 3: Look for any markdown code block
    if (!fixedSql) {
      const anyCodeBlockMatch = content.match(/```\s*([\s\S]*?)```/i);
      if (anyCodeBlockMatch) {
        fixedSql = anyCodeBlockMatch[1].trim();
      }
    }
    
    // Strategy 4: Look for SELECT statement (fallback)
    if (!fixedSql) {
      const selectMatch = content.match(/(SELECT[\s\S]*?)(?=\n\n|$)/i);
      if (selectMatch) {
        fixedSql = selectMatch[1].trim();
      }
    }
    
    // Parse explanation
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)$/i);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }
    
    if (!fixedSql) {
      logger.warn('[FixQuery] LLM did not return valid SQL', {
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
      });
      console.log('[FixQuery] Failed to parse SQL from response');
      return null;
    }

    logger.info('[FixQuery] Successfully fixed query', {
      originalLength: originalSql.length,
      fixedLength: fixedSql.length,
      explanation: explanation.substring(0, 100),
    });

    return { sql: fixedSql, explanation };
  } catch (error) {
    logger.error('[FixQuery] Error fixing query with LLM:', error);
    return null;
  }
}

/**
 * Process analytics request using a sequential agent workflow
 * @param {string} connectionId - Database connection ID
 * @param {string} question - User's question
 * @param {string} analyticsModel - LLM model for SQL generation
 * @param {Function} onToolCall - Callback when tool is called (for streaming)
 * @param {Function} onThinking - Callback when agent is thinking (for streaming)
 * @param {string} userId - User ID for authorization and usage tracking
 * @param {string} originalQuestion - Original user question for skill matching (without context)
 * @returns {Promise<Object>} - { 
 *   success: boolean,
 *   text: string,           // Formatted markdown response
 *   explanation: string,    // Query explanation
 *   sql: string,           // Generated SQL
 *   results: Object,       // Query results
 *   error: string,         // Error message if success is false
 *   toolCallCount: number  // Number of steps executed
 * }
 */
async function processAnalyticsWithAgent(
  connectionId,
  question,
  analyticsModel,
  onToolCall = null,
  onThinking = null,
  userId = null,
  originalQuestion = null, // Store original user question for skill matching
) {
  // Validate required parameters
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    logger.warn('[Analytics Agent] Invalid question provided');
    return {
      success: false,
      error: 'A valid question is required',
      text: 'Error: Please provide a valid question to analyze.',
      toolCallCount: 0,
    };
  }

  // Use original question if provided, otherwise try to extract from question
  const questionForSkills = originalQuestion || question;
  
  logger.info('[Analytics Agent] Starting agent-based processing:', {
    connectionId,
    question: question?.substring(0, 100),
    originalQuestion: originalQuestion?.substring(0, 100),
    questionForSkills: questionForSkills?.substring(0, 100),
    analyticsModel: analyticsModel || 'NOT PROVIDED',
  });

  let step = 0;
  let connection = null;
  let schema = null;
  let sql = null;
  let explanation = null;
  let queryResult = null;
  let formattedText = null;

  try {
    // Step 1: Get database connection
    step++;
    if (onThinking) {
      await onThinking({
        message: 'Getting database connection...',
        step,
      });
    }
    if (onToolCall) {
      await onToolCall({
        tool: 'get_db_connection',
        args: { connectionId },
        step,
        status: 'starting',
      });
    }

    const connectionResult = await getDbConnectionTool.func({ connectionId });
    const connectionData = JSON.parse(connectionResult);
    if (!connectionData.success) {
      throw new Error(connectionData.error || 'Failed to get database connection');
    }
    connection = connectionData.connection;

    if (onToolCall) {
      await onToolCall({
        tool: 'get_db_connection',
        result: connectionData,
        step,
        status: 'completed',
      });
    }

    // ⭐ Check if user owns the connection
    if (userId && connection.createdBy && connection.createdBy.toString() !== userId.toString()) {
      const errorMsg = 'Unauthorized: You do not have permission to access this database connection';
      logger.warn('[Analytics Agent] Unauthorized access attempt:', {
        connectionId,
        userId,
        ownerId: connection.createdBy,
      });
      if (onToolCall) {
        await onToolCall({
          tool: 'get_db_connection',
          error: errorMsg,
          step,
          status: 'completed',
        });
      }
      throw new Error(errorMsg);
    }

    // Step 2: Check schema cache
    step++;
    if (onThinking) {
      await onThinking({
        message: 'Checking schema cache...',
        step,
      });
    }
    if (onToolCall) {
      await onToolCall({
        tool: 'check_schema_cache',
        args: { connectionId },
        step,
        status: 'starting',
      });
    }

    const cacheResult = await checkSchemaCacheTool.func({ connectionId });
    const cacheData = JSON.parse(cacheResult);
    if (!cacheData.success) {
      throw new Error(cacheData.error || 'Failed to check schema cache');
    }

    if (onToolCall) {
      await onToolCall({
        tool: 'check_schema_cache',
        result: cacheData,
        step,
        status: 'completed',
      });
    }

    // Step 3: Extract schema if needed
    if (cacheData.needsRefresh || !cacheData.cached) {
      step++;
      if (onThinking) {
        await onThinking({
          message: cacheData.cached
            ? 'Schema cache expired, extracting fresh schema...'
            : 'Extracting database schema...',
          step,
        });
      }
      if (onToolCall) {
        await onToolCall({
          tool: 'retrieving_schema',
          args: { connectionId, source: cacheData.cached ? 'refresh' : 'fresh' },
          step,
          status: 'starting',
        });
      }
      // if (onToolCall) {
      //   await onToolCall({
      //     tool: 'extract_schema',
      //     args: { connectionId },
      //     step,
      //     status: 'starting',
      //   });
      // }

      const extractResult = await extractSchemaTool.func({ connectionId });
      const extractData = JSON.parse(extractResult);
      if (!extractData.success) {
        throw new Error(extractData.error || 'Failed to extract schema');
      }
      schema = extractData.schema;

      if (onToolCall) {
        await onToolCall({
          tool: 'retrieving_schema',
          result: { tableCount: schema?.tables?.length || 0 },
          step,
          status: 'completed',
        });
      }
      // if (onToolCall) {
      //   await onToolCall({
      //     tool: 'extract_schema',
      //     result: extractData,
      //     step,
      //     status: 'completed',
      //   });
      // }

      // Step 4: Cache schema
      step++;
      if (onThinking) {
        await onThinking({
          message: 'Caching schema for future use...',
          step,
        });
      }
      if (onToolCall) {
        await onToolCall({
          tool: 'cache_schema',
          args: { connectionId, schema },
          step,
          status: 'starting',
        });
      }

      const cacheSchemaResult = await cacheSchemaTool.func({ connectionId, schema });
      const cacheSchemaData = JSON.parse(cacheSchemaResult);
      if (!cacheSchemaData.success) {
        logger.warn('[Analytics Agent] Failed to cache schema:', cacheSchemaData.error);
        // Non-fatal, continue
      }

      if (onToolCall) {
        await onToolCall({
          tool: 'cache_schema',
          result: cacheSchemaData,
          step,
          status: 'completed',
        });
      }
    } else {
      // Use cached schema
      step++;
      if (connectionId === 'sample-db') {
        // For sample DB, get schema from the sample DB service cache
        schema = await extractSampleDbSchema();
        logger.info('[Analytics Agent] Using cached sample database schema');
      } else {
        // For regular connections, get from MongoDB
        const dbConnection = await require('~/db/models').DatabaseConnection.findById(connectionId);
        schema = dbConnection?.cachedSchema;
        
        // Check if embeddings exist, generate if not (BLOCKING for first time)
        if (schema?.tables?.length > 0) {
          try {
            const { findRelevantTablesByEmbedding } = require('../Analytics/tableRAGService');
            const { generateEmbedding } = require('../Analytics/embeddingService');
            
            // Quick check if embeddings exist (with safe fallback)
            let existingTables = [];
            try {
              const testEmbedding = await generateEmbedding('test');
              existingTables = await findRelevantTablesByEmbedding(connectionId, testEmbedding, 1);
            } catch (embeddingCheckErr) {
              logger.warn('[Analytics Agent] Embedding service check failed, continuing without:', embeddingCheckErr.message);
              // Continue without blocking - keyword fallback will work
            }
            
            if (existingTables.length === 0) {
              logger.info('[Analytics Agent] Table embeddings not found, generating now (this may take a moment)...');
              if (onThinking) {
                await onThinking({
                  message: 'Generating table embeddings for semantic search...',
                  step: step + 1,
                });
              }
              // Await embedding generation for first time
              await storeTableNameEmbeddings(connectionId, schema);
              logger.info('[Analytics Agent] Table embeddings generated successfully');
            } else {
              // Embeddings exist, trigger refresh in background
              storeTableNameEmbeddings(connectionId, schema).catch(err => {
                logger.debug('[Analytics Agent] Background table embedding refresh failed:', err.message);
              });
            }
          } catch (err) {
            logger.warn('[Analytics Agent] Could not check/generate embeddings:', err.message);
            // Continue anyway, keyword fallback will work
          }
        }
      }
      if (onThinking) {
        await onThinking({
          message: 'Using cached schema (still valid)...',
          step,
        });
      }
    }

    // Step 5: Generate SQL query
    step++;
    if (onThinking) {
      await onThinking({
        message: 'Generating SQL query from your question...',
        step,
      });
    }
    if (onToolCall) {
      await onToolCall({
        tool: 'generate_sql_query',
        args: { connectionId, question, schema, analyticsModel, userId },
        step,
        status: 'starting',
      });
    }

    const sqlResult = await generateSqlQueryTool.func({
      connectionId,
      question,
      schema,
      analyticsModel,
      userId,
      originalQuestion: questionForSkills, // Pass original question for skill matching
    });
    const sqlData = JSON.parse(sqlResult);
    if (!sqlData.success) {
      throw new Error(sqlData.error || 'Failed to generate SQL query');
    }
    sql = sqlData.sql;
    explanation = sqlData.explanation;

    if (onToolCall) {
      await onToolCall({
        tool: 'generate_sql_query',
        result: { sql, explanation, tokensUsed: sqlData.tokensUsed },
        step,
        status: 'completed',
      });
    }

    // Step 6: Execute SQL query (with retry on error)
    step++;
    let executeAttempts = 0;
    const maxExecuteAttempts = CONFIG.MAX_EXECUTE_ATTEMPTS; // Original + 1 retry
    let executeError = null;
    let finalExecuteData = null; // Store final execute data for later use
    
    while (executeAttempts < maxExecuteAttempts) {
      executeAttempts++;
      executeError = null;
      
      if (onThinking) {
        await onThinking({
          message: executeAttempts === 1 ? 'Executing SQL query...' : `Retrying query execution (attempt ${executeAttempts})...`,
          step,
        });
      }
      if (onToolCall) {
        await onToolCall({
          tool: 'execute_sql_query',
          args: { connectionId, sql },
          step,
          status: 'starting',
        });
      }

      const executeResult = await executeSqlQueryTool.func({ connectionId, sql });
      const executeData = JSON.parse(executeResult);
      finalExecuteData = executeData; // Save for later
      
      if (executeData.success) {
        queryResult = executeData.results;
        executeError = null;
        break; // Success - exit retry loop
      }
      
      // Execution failed
      executeError = executeData.error || 'Failed to execute SQL query';
      
      if (executeAttempts < maxExecuteAttempts) {
        // Try to fix the query using LLM
        logger.warn('[Analytics Agent] Query execution failed, attempting to fix with LLM', {
          attempt: executeAttempts,
          error: executeError,
        });
        
        if (onThinking) {
          await onThinking({
            message: 'Query failed, analyzing error and fixing...',
            step,
          });
        }
        
        const fixResult = await fixQueryWithLLM(
          sql,
          executeError,
          schema,
          connection?.type || 'unknown',
          analyticsModel,
          questionForSkills
        );
        
        if (fixResult && fixResult.sql) {
          sql = fixResult.sql;
          // Keep the original explanation that describes what the query does
          // The fix explanation describes how the error was fixed - not relevant for user output
          // explanation = fixResult.explanation || explanation; // REMOVED: Don't overwrite with fix explanation
          
          logger.info('[Analytics Agent] Query fixed by LLM, retrying execution', {
            originalError: executeError.substring(0, 100),
            fixedSql: sql.substring(0, 100),
            fixExplanation: fixResult.explanation, // Log the fix explanation for debugging
          });
          
          if (onToolCall) {
            await onToolCall({
              tool: 'generate_sql_query',
              result: { 
                sql, 
                explanation: explanation, // Keep original explanation, don't add fix details 
                tokensUsed: 0,
                isRetry: true 
              },
              step,
              status: 'completed',
            });
          }
        } else {
          logger.warn('[Analytics Agent] Could not fix query with LLM, giving up');
          break; // Couldn't fix - exit loop and throw error
        }
      }
    }
    
    // If we still have an error after all attempts, throw it
    if (executeError) {
      throw new Error(executeError);
    }

    if (onToolCall) {
      await onToolCall({
        tool: 'execute_sql_query',
        result: finalExecuteData,
        step,
        status: 'completed',
      });
    }

    // Step 7: Format results
    step++;
    if (onThinking) {
      await onThinking({
        message: 'Formatting results...',
        step,
      });
    }
    if (onToolCall) {
      await onToolCall({
        tool: 'format_results',
        args: { explanation, sql, results: queryResult },
        step,
        status: 'starting',
      });
    }

    const formatResult = await formatResultsTool.func({
      explanation,
      sql,
      results: queryResult,
    });
    const formatData = JSON.parse(formatResult);
    if (!formatData.success) {
      throw new Error(formatData.error || 'Failed to format results');
    }
    formattedText = formatData.formattedText;

    if (onToolCall) {
      await onToolCall({
        tool: 'format_results',
        result: formatData,
        step,
        status: 'completed',
      });
    }

    // Step 8: Increment query count (non-blocking)
    step++;
    if (onThinking) {
      await onThinking({
        message: 'Updating usage statistics...',
        step,
      });
    }
    if (onToolCall) {
      await onToolCall({
        tool: 'increment_query_count',
        args: { connectionId },
        step,
        status: 'starting',
      });
    }

    try {
      const incrementResult = await incrementQueryCountTool.func({ connectionId, userId });
      const incrementData = JSON.parse(incrementResult);
      if (onToolCall) {
        await onToolCall({
          tool: 'increment_query_count',
          result: incrementData,
          step,
          status: 'completed',
        });
      }
    } catch (error) {
      logger.warn('[Analytics Agent] Failed to increment query count:', error);
      // Non-fatal, continue
    }

    return {
      success: true,
      text: formattedText,
      explanation,
      sql,
      results: queryResult,
      toolCallCount: step,
    };
  } catch (error) {
    logger.error('[Analytics Agent] Error in agent processing:', error);
    return {
      success: false,
      error: error.message || 'Failed to process analytics request with agent',
      text: `Error: ${error.message || 'Failed to process analytics request'}`,
      toolCallCount: step,
    };
  }
}

module.exports = {
  processAnalyticsWithAgent,
};

