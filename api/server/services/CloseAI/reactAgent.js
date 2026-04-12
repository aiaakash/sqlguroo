const { logger } = require('@librechat/data-schemas');
const { ChatOpenAI } = require('@langchain/openai');
const { AgentExecutor, createToolCallingAgent } = require('langchain/agents');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { BaseCallbackHandler } = require('@langchain/core/callbacks/base');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../../logs/react_agent_llm.log');

function logLLM(message, data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;

  try {
    const logsDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (err) {
    console.error('[ReAct Agent] Failed to write to log file:', err.message);
  }
}

/**
 * Custom callback handler to stream tool calls in real-time
 */
class StreamingToolCallbackHandler extends BaseCallbackHandler {
  constructor(onToolCall, onThinking) {
    super();
    this.onToolCall = onToolCall;
    this.onThinking = onThinking;
    this.stepCount = 0;
    this.name = 'streaming_tool_callback';
  }

  async handleLLMStart(llm, prompts, runId, parentRunId, tags, metadata) {
    logLLM('LLM call starting...', { prompts });

    // Stream LLM thinking event to client
    try {
      if (this.onThinking) {
        await this.onThinking({
          message: '🤖 Agent is thinking...',
          step: this.stepCount + 1,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleLLMStart:', { error: err.message });
    }
  }

  async handleLLMEnd(output, runId, parentRunId, tags, metadata) {
    logLLM('LLM call completed', output);

    // Stream LLM thinking completion to client
    try {
      if (this.onThinking) {
        await this.onThinking({
          message: '✅ Agent decision complete',
          step: this.stepCount + 1,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleLLMEnd:', { error: err.message });
    }
  }

  async handleLLMError(error, runId, parentRunId, tags, metadata) {
    logLLM('LLM Error', { error: error.message });

    // Stream LLM error to client
    try {
      if (this.onThinking) {
        await this.onThinking({
          message: `❌ Agent error: ${error.message}`,
          step: this.stepCount + 1,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleLLMError:', { error: err.message });
    }
  }

  async handleToolStart(tool, input, runId, parentRunId, tags, metadata, name) {
    this.stepCount++;
    const toolName = name || tool?.name || 'unknown_tool';

    logger.info(`[ReAct Agent] Tool starting: ${toolName}`, { step: this.stepCount });

    // Build contextual thinking message based on tool
    const thinkingMessages = {
      get_db_connection: '🔌 Connecting to the database to access your data...',
      check_schema_cache: '💾 Checking if database schema information is already cached...',
      retrieving_schema: '📊 Retrieving database schema to understand table structures...',
      extract_schema: '📊 Extracting detailed schema information from the database...',
      list_available_tables: '🗂️  Listing all available tables in the database...',
      select_relevant_tables: '🎯 Analyzing your question to identify relevant tables...',
      extract_schema_for_tables: '📋 Extracting detailed schema for the selected tables...',
      generate_sql_query:
        '✨ Generating SQL query based on your question and the database schema...',
      execute_sql_query: '⚡ Executing the generated SQL query against the database...',
      fix_sql_error: '🛠️  Detected an error in the SQL query. Analyzing and fixing...',
      format_results: '📝 Formatting query results into a readable response...',
    };

    const thinkingMessage =
      thinkingMessages[toolName] || `Step ${this.stepCount}: Executing ${toolName}...`;

    try {
      if (this.onToolCall) {
        await this.onToolCall({
          tool: toolName,
          status: 'starting',
          step: this.stepCount,
        });
      }

      if (this.onThinking) {
        await this.onThinking({
          message: thinkingMessage,
          step: 2 + this.stepCount,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleToolStart:', { error: err.message });
    }
  }

  async handleToolEnd(output, runId, parentRunId, tags, metadata, name) {
    const toolName = name || 'unknown_tool';

    logger.info(`[ReAct Agent] Tool completed: ${toolName}`, { step: this.stepCount });

    try {
      if (this.onToolCall) {
        await this.onToolCall({
          tool: toolName,
          status: 'completed',
          step: this.stepCount,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleToolEnd:', { error: err.message });
    }
  }

  async handleToolError(error, runId, parentRunId, tags, metadata, name) {
    const toolName = name || 'unknown_tool';

    logger.error(`[ReAct Agent] Tool error: ${toolName}`, { error: error.message });

    try {
      if (this.onToolCall) {
        await this.onToolCall({
          tool: toolName,
          status: 'completed',
          step: this.stepCount,
          error: error.message,
        });
      }
    } catch (err) {
      logger.error('[ReAct Agent Callback] Error in handleToolError:', { error: err.message });
    }
  }
}

/**
 * ReAct Agent for Self-Orchestrating Analytics
 *
 * ReAct Pattern:
 * Thought → Action → Observation → Thought → ... → Final Answer
 *
 * Uses existing tools from analyticsTools.js
 */

// Import existing analytics tools (already defined as DynamicStructuredTool)
const {
  getDbConnectionTool,
  listAvailableTablesTool,
  selectRelevantTablesTool,
  extractSchemaForTablesTool,
  generateSqlQueryTool,
  executeSqlQueryTool,
  formatResultsTool,
  incrementQueryCountTool,
} = require('./analyticsTools');

/**
 * Build contextual thinking message for a tool
 * @param {string} toolName - Name of the tool
 * @returns {string} - Contextual thinking message
 */
function getToolThinkingMessage(toolName) {
  const messages = {
    get_db_connection: '🔌 Connecting to the database to access your data...',
    check_schema_cache: '💾 Checking if database schema information is already cached...',
    retrieving_schema: '📊 Retrieving database schema to understand table structures...',
    extract_schema: '📊 Extracting detailed schema information from the database...',
    list_available_tables: '🗂️  Listing all available tables in the database...',
    select_relevant_tables: '🎯 Analyzing your question to identify relevant tables...',
    extract_schema_for_tables: '📋 Extracting detailed schema for the selected tables...',
    generate_sql_query: '✨ Generating SQL query based on your question and the database schema...',
    execute_sql_query: '⚡ Executing the generated SQL query against the database...',
    fix_sql_error: '🛠️  Detected an error in the SQL query. Analyzing and fixing...',
    format_results: '📝 Formatting query results into a readable response...',
  };
  return messages[toolName] || `Executing ${toolName}...`;
}

/**
 * Wrap tools with callback handlers for streaming
 */
function wrapToolsWithCallbacks(tools, onToolCall, onThinking) {
  let globalStepCounter = 0;

  return tools.map((tool) => {
    if (!tool || !tool.name) return tool;

    return {
      ...tool,
      invoke: async (input, options) => {
        globalStepCounter++;
        const step = globalStepCounter;
        const toolName = tool.name;

        logger.info(`[ReAct Agent] Tool starting: ${toolName}`, { step });

        try {
          if (onToolCall) {
            await onToolCall({
              tool: toolName,
              status: 'starting',
              step: step,
            });
          }

          if (onThinking) {
            await onThinking({
              message: getToolThinkingMessage(toolName),
              step: 2 + step,
            });
          }
        } catch (err) {
          logger.error('[ReAct Agent] Error sending start event:', { error: err.message });
        }

        let result;
        try {
          result = await tool.invoke(input, options);
          logger.info(`[ReAct Agent] Tool executed: ${toolName}`);
        } catch (error) {
          logger.error(`[ReAct Agent] Tool error: ${toolName}`, { error: error.message });
          if (onToolCall) {
            await onToolCall({
              tool: toolName,
              status: 'completed',
              step: step,
              error: error.message,
            });
          }
          throw error;
        }

        try {
          if (onToolCall) {
            await onToolCall({
              tool: toolName,
              status: 'completed',
              step: step,
            });
          }
        } catch (err) {
          logger.error('[ReAct Agent] Error sending completed event:', { error: err.message });
        }

        return result;
      },
    };
  });
}

const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

/**
 * React Agent specific SQL fixer using reasoning model
 * This is a standalone implementation that uses ChatOpenAI like the rest of the React Agent
 */
async function fixSqlWithLLM(originalSql, errorMessage, schema, databaseType, reasoningModel) {
  try {
    const selectedModel = reasoningModel || 'moonshotai/kimi-k2.5';

    // Determine provider configuration
    const isOpenRouter = selectedModel.includes('/');
    const isXaiModel = selectedModel.startsWith('grok-');

    let configuration = {};
    if (isOpenRouter) {
      configuration = {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      };
    } else if (isXaiModel) {
      configuration = {
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY,
      };
    } else {
      // Moonshot for kimi models
      configuration = {
        baseURL: 'https://api.moonshot.cn/v1',
        apiKey: process.env.MOONSHOT_API_KEY,
      };
    }

    // Create LLM instance for SQL fixing
    const fixLLM = new ChatOpenAI({
      modelName: selectedModel,
      temperature: 0.1,
      maxTokens: 4000,
      configuration,
    });

    const schemaText = schema
      ? JSON.stringify(schema, null, 2).substring(0, 3000)
      : 'No schema provided';

    const messages = [
      {
        role: 'system',
        content: `You are an expert SQL debugger. Fix the SQL query that failed.

Database Type: ${databaseType?.toUpperCase() || 'UNKNOWN'}

CRITICAL RULES:
1. Analyze the error and fix ONLY the specific issue
2. Return ONLY the corrected SQL query
3. Use exact table/column names from schema
4. Add LIMIT 1000 to prevent excessive results
${databaseType?.toLowerCase() === 'clickhouse' ? '5. ClickHouse requires LOWERCASE window functions: lag(), lead(), row_number() - NOT uppercase LAG(), LEAD(), ROW_NUMBER()' : ''}

Output format (EXACTLY):
SQL: YOUR_CORRECTED_SQL_QUERY_HERE
EXPLANATION: Brief explanation of what was fixed`,
      },
      {
        role: 'user',
        content: `Failed SQL Query:
${originalSql}

Error Message:
${errorMessage}

Database Schema:
${schemaText}

Please fix the SQL query to resolve the error.`,
      },
    ];

    logger.info('[FixSqlWithLLM] Calling LLM with model:', selectedModel);
    const response = await fixLLM.invoke(messages);
    logLLM('fixSqlWithLLM response', response);
    const content = response.content;

    // Parse SQL and explanation from response
    let fixedSql = '';
    let explanation = '';

    const sqlMatch = content.match(/SQL:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)$/i);

    if (sqlMatch) {
      fixedSql = sqlMatch[1].trim();
      // Remove markdown code blocks if present
      fixedSql = fixedSql
        .replace(/```sql\s*/gi, '')
        .replace(/```\s*$/gm, '')
        .trim();
    }

    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    if (!fixedSql) {
      logger.warn('[FixSqlWithLLM] Could not extract SQL from response');
      return null;
    }

    logger.info('[FixSqlWithLLM] Successfully fixed SQL');
    return { sql: fixedSql, explanation };
  } catch (error) {
    logger.error('[FixSqlWithLLM] Error:', error.message);
    return null;
  }
}

// Create fix_sql_error tool for React Agent
const fixSqlErrorTool = new DynamicStructuredTool({
  name: 'fix_sql_error',
  description: `Fixes a failed SQL query using a reasoning LLM. 
Use this tool when execute_sql_query returns an error.
The tool analyzes the error message and schema to generate a corrected SQL query.

IMPORTANT: This tool uses a powerful reasoning model (kimi-k2.5 by default) for complex debugging.`,
  schema: z.object({
    connectionId: z.string().describe('The database connection ID'),
    originalSql: z.string().describe('The SQL query that failed'),
    errorMessage: z.string().describe('The error message from the database'),
    schema: z.any().nullable().optional().describe('Database schema for context'),
    analyticsModel: z
      .string()
      .nullable()
      .optional()
      .describe('Model to use (auto-set to reasoning model)'),
  }),
  func: async ({ connectionId, originalSql, errorMessage, schema, analyticsModel }) => {
    try {
      logger.info('[Fix SQL Error Tool] Fixing failed query:', {
        connectionId,
        errorPreview: errorMessage?.substring(0, 100),
      });

      const reasoningModel =
        analyticsModel || process.env.ANALYTICS_SQL_FIX_MODEL || 'moonshotai/kimi-k2.5';

      // Get connection type for better error fixing
      const { getDbConnectionTool } = require('./analyticsTools');
      const connectionResult = await getDbConnectionTool.func({ connectionId });
      const connectionData = JSON.parse(connectionResult);
      const databaseType = connectionData.success ? connectionData.connection?.type : 'unknown';

      // Use React Agent's own SQL fixer
      const fixResult = await fixSqlWithLLM(
        originalSql,
        errorMessage,
        schema,
        databaseType,
        reasoningModel,
      );

      if (!fixResult || !fixResult.sql) {
        return JSON.stringify({
          success: false,
          error: 'Could not fix the SQL query automatically',
          originalError: errorMessage,
        });
      }

      return JSON.stringify({
        success: true,
        fixedSql: fixResult.sql,
        explanation: fixResult.explanation,
        modelUsed: reasoningModel,
      });
    } catch (error) {
      logger.error('[Fix SQL Error Tool] Error fixing query:', error);
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
});

/**
 * Create ReAct Agent with existing analytics tools
 */
async function createReActAgent(analyticsModel, onToolCall = null, onThinking = null) {
  // Initialize LLM
  const modelName = analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free';
  const isOpenRouter = modelName.includes('/');

  // Create callback handler for logging LLM responses
  const loggingCallback = new StreamingToolCallbackHandler(onToolCall, onThinking);

  const llm = new ChatOpenAI({
    modelName: modelName,
    temperature: 0.2,
    maxTokens: 4000,
    ...(isOpenRouter && {
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      },
    }),
    callbacks: [loggingCallback],
  });

  // Tools are already DynamicStructuredTool instances that return JSON strings
  // Note: fixSqlErrorTool is included for error recovery with reasoning model
  const baseTools = [
    getDbConnectionTool,
    listAvailableTablesTool,
    selectRelevantTablesTool,
    extractSchemaForTablesTool,
    generateSqlQueryTool,
    executeSqlQueryTool,
    fixSqlErrorTool,
    formatResultsTool,
    incrementQueryCountTool,
  ];

  // Wrap tools with callbacks if provided
  const tools =
    onToolCall && onThinking
      ? wrapToolsWithCallbacks(baseTools, onToolCall, onThinking)
      : baseTools;

  // Log tool availability for debugging
  tools.forEach((tool, idx) => {
    if (!tool) {
      logger.error(`[ReAct Agent] Tool ${idx} is undefined!`);
    } else if (!tool.name) {
      logger.error(`[ReAct Agent] Tool ${idx} has no name`);
    } else {
      logger.info(`[ReAct Agent] Tool ${idx}: ${tool.name} ✓`);
    }
  });

  // Create prompt template for the agent
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a helpful data analytics agent that answers questions about databases and business analytics using the available tools.
 Use the ReAct loop: Thought → Action → Observation → repeat until done.

## Tools Available
- get_db_connection
- list_available_tables(connectionId)
- select_relevant_tables(connectionId, question) — uses cached tables, no tables param needed
- extract_schema_for_tables(tables)
- generate_sql_query(schema, question, analyticsModel, userId, originalQuestion)
- execute_sql_query(sql, connectionId)
- fix_sql_error(sql, error) → returns fixedSql
- format_results(sql, results)
- increment_query_count(connectionId) — tracks usage, call after format_results

## Rules
- Always use the same connectionId throughout a session
- Never call extract_schema on all tables — only on relevant ones
- On SQL error: call fix_sql_error, then retry execute_sql_query with fixedSql
- Pass actual executed SQL to format_results, not generated SQL
- Skip steps that aren't needed (e.g. if connectionId already exists, skip get_db_connection)
- When calling generate_sql_query, ALWAYS pass userId and originalQuestion from the input context for skill matching

## Efficient Schema Discovery
list_available_tables → select_relevant_tables → extract_schema_for_tables
This 3-step pattern minimizes token usage by fetching full schema only for relevant tables.

Be methodical and thorough. If a query fails, analyze the error and try again with a corrected approach.`,
    ],
    ['placeholder', '{chat_history}'],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);

  // Create tool calling agent (modern approach for function calling models)
  const agent = await createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  // Create executor with configuration
  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 15,
    verbose: false, // Disable verbose LangChain logging
    returnIntermediateSteps: true,
  });

  return executor;
}

/**
 * Main function to run ReAct agent for analytics
 */
async function runReActAgent({
  connectionId,
  message,
  analyticsModel,
  onToolCall,
  onThinking,
  userId,
  chatHistory = null,
  originalQuestion,
}) {
  const startTime = Date.now();
  const stepLog = [];

  try {
    logger.info('[ReAct Agent] Starting ReAct agent execution', {
      connectionId,
      question: message?.substring(0, 100),
    });

    onThinking?.({
      message: '🤔 Analyzing your request and preparing to answer your database question...',
      step: 1,
    });

    const executor = await createReActAgent(analyticsModel, onToolCall, onThinking);

    // Prepare input with context
    const input = `
Database Connection: ${connectionId}
User Question: ${message}
User ID: ${userId || 'anonymous'}
Original Question (for skill matching): ${originalQuestion || message}
Analytics Model: ${analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free'}

Use the below available tools to answer the question:
1. get_db_connection → validate connection
2. list_available_tables(connectionId: "${connectionId}")
3. select_relevant_tables(connectionId: "${connectionId}", question) — tables are cached, no tables param needed
4. extract_schema_for_tables(selected tables only)
5. generate_sql_query(schema, question, analyticsModel, userId, originalQuestion)
6. execute_sql_query → on error: fix_sql_error → retry
7. format_results(executedSql, results)

IMPORTANT: 
- When calling generate_sql_query, ALWAYS pass these parameters:
  - analyticsModel: "${analyticsModel || process.env.ANALYTICS_OPENAI_MODEL || 'z-ai/glm-4.5-air:free'}"
  - userId: "${userId || 'anonymous'}"
  - originalQuestion: "${(originalQuestion || message || '').replace(/"/g, '\\"').replace(/\n/g, ' ')}"
- Use the SAME connectionId for list_available_tables and select_relevant_tables
- select_relevant_tables does NOT need a tables parameter (uses internal cache)
- This saves tokens by only loading relevant table schemas

Sometimes, User's question may be generic and answerable via direct LLM response using chat history or context without using any SQL tools`;

    onThinking?.({
      message:
        '📋 Planning approach: I need to understand your question, identify relevant database tables, and generate an appropriate SQL query to find the answer.',
      step: 2,
    });

    // Execute the agent - tool callbacks are handled via wrapped tools
    logLLM('Invoking executor with input', { input, hasChatHistory: !!chatHistory });

    // Build the executor input with optional chat history
    // LangChain expects chat_history as an array of message objects
    const executorInput = {
      input,
      ...(chatHistory && {
        chat_history: [new HumanMessage(`[Previous Conversation Summary]\n${chatHistory}`)],
      }),
    };

    const result = await executor.invoke(executorInput);
    logLLM('Full executor result', result);
    logLLM('Executor output', {
      output: result.output,
      steps: result.intermediateSteps?.length || 0,
    });

    // Track SQL execution and formatted results for final output enrichment
    let executedSql = null;
    let wasFixed = false;
    let formattedResults = null;

    // Log intermediate steps for debugging (concise)
    // Note: Tool calls are now streamed in real-time via callbacks above
    if (result.intermediateSteps) {
      logger.info(`[ReAct Agent] Completed ${result.intermediateSteps.length} steps`);

      result.intermediateSteps.forEach((step, idx) => {
        const action = step.action;
        const observation = step.observation;

        // Log one-liner summary per step
        const obsPreview = observation
          ? observation.length > 80
            ? observation.substring(0, 80) + '...'
            : observation
          : 'empty';
        logger.info(`[ReAct Agent] Step ${idx + 1}: ${action.tool} → ${obsPreview}`);

        stepLog.push({
          step: idx + 1,
          tool: action.tool,
          status: 'completed',
        });

        // Track SQL from generate_sql_query or fix_sql_error
        try {
          if (action.tool === 'generate_sql_query' && observation) {
            const obsParsed = JSON.parse(observation);
            if (obsParsed.success && obsParsed.sql) {
              executedSql = obsParsed.sql;
            }
          }
          if (action.tool === 'fix_sql_error' && observation) {
            const obsParsed = JSON.parse(observation);
            if (obsParsed.success && obsParsed.fixedSql) {
              executedSql = obsParsed.fixedSql;
              wasFixed = true;
              logger.info('[ReAct Agent] SQL was fixed during execution');
            }
          }
          if (action.tool === 'format_results' && observation) {
            const obsParsed = JSON.parse(observation);
            if (obsParsed.success && obsParsed.formattedText) {
              formattedResults = obsParsed.formattedText;
              logger.info('[ReAct Agent] Captured formatted results from format_results tool');
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      });
    }

    const totalTime = Date.now() - startTime;

    // Log final output preview
    const outputPreview = result.output
      ? result.output.length > 100
        ? result.output.substring(0, 100) + '...'
        : result.output
      : 'no output';
    logger.info(
      `[ReAct Agent] Done: ${result.intermediateSteps?.length || 0} steps, ${totalTime}ms → ${outputPreview}`,
    );

    // Parse the final output
    let finalOutput = result.output;
    let finalSql = null;

    // Helper function to clean LLM summary - remove SQL, explanation, and table duplicates
    const cleanLlmSummary = (summary) => {
      if (!summary) return null;

      let cleaned = summary;

      // Remove "Generated SQL Query:" sections (with or without bold)
      cleaned = cleaned.replace(/\*\*Generated SQL Query[^*]*\*\*[\s\S]*?```sql[\s\S]*?```/gi, '');
      cleaned = cleaned.replace(/Generated SQL Query[^\n]*[\s\S]*?```sql[\s\S]*?```/gi, '');

      // Remove standalone SQL code blocks
      cleaned = cleaned.replace(/```sql[\s\S]*?```/gi, '');

      // Remove "SQL:" followed by query text (no code block)
      cleaned = cleaned.replace(/\*\*SQL:\*\*[\s\S]*?(?=\n\n|\n#|\n\*\*|$)/gi, '');

      // Remove "Query Results:" sections with markdown tables
      cleaned = cleaned.replace(
        /\*\*Query Results:\*\*[\s\S]*?(?=\n\n---|\n\n###|\n\n##|\n\n\*\*[^*]|$)/gi,
        '',
      );
      cleaned = cleaned.replace(
        /Query Results:?\s*\n[\s\S]*?(?=\n\n---|\n\n###|\n\n##|\n\n\*\*[^*]|$)/gi,
        '',
      );

      // Remove markdown tables (lines starting with |)
      cleaned = cleaned.replace(/\|.*\|[\r\n]+\|[-:| ]+\|[\r\n]+(\|.*\|[\r\n]*)+/gi, '');

      // Remove explanation paragraphs that start with "This query" or similar
      cleaned = cleaned.replace(/This query[\s\S]*?(?=\n\n|\n#|\n\*\*|$)/gi, '');

      // Clean up excessive whitespace
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

      // If nothing meaningful left after cleaning, return null
      if (cleaned.length < 20 || !cleaned.match(/[a-zA-Z]/)) {
        return null;
      }

      return cleaned;
    };

    // If we have formatted results from format_results tool, combine with LLM summary
    if (formattedResults) {
      // Clean the LLM summary to remove duplicates
      const cleanedSummary = cleanLlmSummary(result.output);

      if (cleanedSummary) {
        // Combine: formatted table + cleaned LLM analysis
        finalOutput = `${formattedResults}\n\n---\n\n### Analysis\n\n${cleanedSummary}`;
        logger.info('[ReAct Agent] Combined formatted results with cleaned LLM summary');
      } else {
        finalOutput = formattedResults;
        logger.info('[ReAct Agent] Using formatted results only (LLM summary was duplicate)');
      }
    } else {
      try {
        const parsed = JSON.parse(finalOutput);
        finalOutput = parsed.formattedText || parsed.narrative || parsed.message || finalOutput;
      } catch {
        if (executedSql && !finalOutput.includes('```sql')) {
          finalOutput = `${finalOutput}`;
        }
      }
    }

    return {
      success: true,
      text: finalOutput,
      output: finalOutput,
      sql: executedSql || finalSql,
      wasFixed,
      intermediateSteps: stepLog,
      metrics: {
        iterations: result.intermediateSteps?.length || 0,
        totalTimeMs: totalTime,
      },
    };
  } catch (error) {
    logger.error('[ReAct Agent] Execution failed:', error);

    return {
      success: false,
      error: error.message,
      intermediateSteps: stepLog,
      text: `Error: ${error.message}`,
    };
  }
}

/**
 * Run ReAct agent with automatic retry on failure
 */
async function runReActAgentWithRecovery(params) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[ReAct Agent] Attempt ${attempt}/${maxRetries}`);

      const result = await runReActAgent({
        ...params,
        onThinking: (event) => {
          params.onThinking?.({
            ...event,
            message: attempt > 1 ? `[Retry ${attempt}] ${event.message}` : event.message,
          });
        },
      });

      if (result.success) {
        return result;
      }

      lastError = result.error;

      if (attempt < maxRetries) {
        logger.warn(`[ReAct Agent] Attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error) {
      lastError = error.message;
      logger.error(`[ReAct Agent] Attempt ${attempt} error:`, error);
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries} attempts. Last error: ${lastError}`,
    text: `Error: Failed to process your request after multiple attempts. ${lastError}`,
  };
}

module.exports = {
  runReActAgent,
  runReActAgentWithRecovery,
  createReActAgent,
};
