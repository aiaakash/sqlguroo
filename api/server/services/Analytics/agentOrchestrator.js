const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');

// Initialize LLM clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// Initialize OpenRouter client (uses OpenAI-compatible API)
const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

/**
 * Available agent types
 */
const AgentTypes = {
  GENERAL_CHAT: 'general_chat', // General SQL Guroo questions, greetings, help
  DATA_ANALYSIS: 'data_analysis', // All database queries, schema exploration, analysis
};

/**
 * System prompt for intent classification
 */
const INTENT_CLASSIFIER_PROMPT = `You are an Intent Classifier for SQL Guroo, a database analytics platform.

Your task is to classify the user's message into ONE of these categories:

1. **general_chat**: General questions about SQL Guroo, greetings, help, documentation, pricing, features, or anything NOT requiring database access.
   - Examples: "What is SQL Guroo?", "How do I connect a database?", "Hello", "What features do you support?"
   - These can be answered with general knowledge without accessing any database.

2. **data_analysis**: ALL database-related questions including queries, schema exploration, and analysis.
   - Examples: "Show me total sales", "What tables do I have?", "Schema for users table", "Describe orders"
   - "How many users signed up this week?", "List all tables", "What columns are in products?"
   - "Analyze sales trends", "Compare revenue by region"
   - ANY question that needs database access goes here

CLASSIFICATION RULES:
- If the question is about SQL Guroo itself (not user data) → general_chat
- If the question needs database access (any query, schema, analysis) → data_analysis
- When unsure, use "data_analysis"
- Return ONLY JSON, no markdown

Response format:
{
  "agentType": "one of: general_chat, data_analysis",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

/**
 * Get LLM client based on model name
 */
function getLLMClient(modelName) {
  if (!modelName || modelName === 'default') {
    modelName = process.env.ORCHESTRATOR_MODEL || 'z-ai/glm-4.5-air:free';
  }

  const isXaiModel = modelName.startsWith('grok-');
  const isOpenRouter = modelName.includes('/');

  if (isXaiModel) return xai;
  if (isOpenRouter) return openRouter;
  return openai;
}

/**
 * Extract text from message content
 */
function extractTextFromMessage(message) {
  if (typeof message === 'string') return message;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part.type === 'text' && part.text) return part.text;
        return '';
      })
      .filter((text) => text)
      .join(' ');
  }
  return '';
}

/**
 * Classify user intent using LLM
 */
async function classifyIntent({ message, connectionId, conversationHistory = [], model = null }) {
  const startTime = Date.now();
  const selectedModel = model || process.env.ORCHESTRATOR_MODEL || 'z-ai/glm-4.5-air:free';
  const client = getLLMClient(selectedModel);

  try {
    const context = conversationHistory
      .filter((m) => m.role && m.content)
      .slice(-3)
      .map((m) => `${m.role}: ${extractTextFromMessage(m)}`)
      .join('\n');

    const userPrompt = `Database Connection: ${connectionId}

${context ? `Recent Conversation:\n${context}\n\n` : ''}Current User Message: "${message}"

Classify this message into one of the available agent types.`;

    const requestParams = {
      model: selectedModel,
      messages: [
        { role: 'system', content: INTENT_CLASSIFIER_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    if (selectedModel.startsWith('grok-') || selectedModel.includes('/')) {
      requestParams.temperature = 0.1;
    }

    const response = await client.chat.completions.create(requestParams);
    const content = response.choices[0]?.message?.content || '';

    // Parse JSON response
    let classification;
    try {
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) ||
        content.match(/```\s*([\s\S]*?)\s*```/) ||
        content.match(/(\{[\s\S]*\})/) ||
        [null, content];
      classification = JSON.parse(jsonMatch[1].trim());
    } catch (parseError) {
      // Fallback to keyword matching
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.match(/^(hi|hello|hey|what is sql guroo|how do i|help me)/)) {
        classification = { agentType: AgentTypes.GENERAL_CHAT, confidence: 0.7 };
      } else {
        // Everything else defaults to data_analysis (including schema queries)
        classification = { agentType: AgentTypes.DATA_ANALYSIS, confidence: 0.5 };
      }
    }

    const duration = Date.now() - startTime;

    logger.info('[AgentOrchestrator] Intent classified', {
      agentType: classification.agentType,
      confidence: classification.confidence,
      durationMs: duration,
      model: selectedModel,
    });

    // Console log for visibility
    console.log('[AgentOrchestrator] Intent classified:', {
      agentType: classification.agentType,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      durationMs: duration,
      model: selectedModel,
    });

    if (!Object.values(AgentTypes).includes(classification.agentType)) {
      classification.agentType = AgentTypes.DATA_ANALYSIS;
    }

    return {
      ...classification,
      durationMs: duration,
      model: selectedModel,
    };
  } catch (error) {
    logger.error('[AgentOrchestrator] Intent classification failed:', error);
    return {
      agentType: AgentTypes.DATA_ANALYSIS,
      confidence: 0.5,
      reasoning: 'Classification failed, defaulting to data analysis',
      error: error.message,
      durationMs: Date.now() - startTime,
      model: selectedModel,
    };
  }
}

/**
 * Handle general chat responses
 */
async function handleGeneralChat({ message, conversationHistory, model, onStream }) {
  const selectedModel = model || process.env.GENERAL_CHAT_MODEL || 'z-ai/glm-4.5-air:free';
  const client = getLLMClient(selectedModel);

  const systemPrompt = `You are SQL Guroo Assistant, a helpful AI for a database analytics platform called SQL Guroo.

You help users with:
- Explaining SQL Guroo features and capabilities
- Database connection guidance
- General SQL and analytics best practices
- Platform usage instructions

IMPORTANT:
- DO NOT generate SQL queries - direct users to use the analytics chat for that
- You have NO access to their database
- Be concise and helpful`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
      .filter((m) => m.role && m.content)
      .slice(-5)
      .map((m) => ({
        role: m.role,
        content: extractTextFromMessage(m),
      })),
    { role: 'user', content: message },
  ];

  const requestParams = {
    model: selectedModel,
    messages,
    max_tokens: 4000,
  };

  if (selectedModel.startsWith('grok-') || selectedModel.includes('/')) {
    requestParams.temperature = 0.7;
  }

  if (onStream) {
    requestParams.stream = true;
    const stream = await client.chat.completions.create(requestParams);
    let fullContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullContent += content;
      await onStream(content, false);
    }
    await onStream('', true);
    return { text: fullContent, streamed: true };
  }

  const response = await client.chat.completions.create(requestParams);
  return {
    text: response.choices[0]?.message?.content || '',
    streamed: false,
    tokensUsed: response.usage?.total_tokens || 0,
  };
}

/**
 * Main orchestration function
 */
async function orchestrate({
  connectionId,
  message,
  analyticsModel,
  orchestratorModel = null,
  conversationHistory = [],
  onToolCall = null,
  onThinking = null,
  onStream = null,
  userId = null,
  originalQuestion = null,
}) {
  const startTime = Date.now();

  const useOrchestrator = process.env.CLOSEAI_USE_ORCHESTRATOR !== 'false';

  if (!useOrchestrator) {
    logger.info('[AgentOrchestrator] Orchestrator disabled');
    const { processAnalyticsWithAgent } = require('../CloseAI/agentProcessor');
    return processAnalyticsWithAgent(
      connectionId,
      message,
      analyticsModel,
      onToolCall,
      onThinking,
      userId,
      originalQuestion || message
    );
  }

  logger.info('[AgentOrchestrator] Starting orchestration', {
    connectionId,
    messagePreview: message.substring(0, 100),
  });

  if (onThinking) {
    await onThinking({ message: 'Analyzing your request...', step: 0 });
  }

  const classification = await classifyIntent({
    message,
    connectionId,
    conversationHistory,
    model: orchestratorModel,
  });

  logger.info('[AgentOrchestrator] Routing to agent', {
    agentType: classification.agentType,
    confidence: classification.confidence,
  });

  console.log('[AgentOrchestrator] Routing to agent:', {
    agentType: classification.agentType,
    confidence: classification.confidence,
  });

  switch (classification.agentType) {
    case AgentTypes.GENERAL_CHAT: {
      if (onThinking) {
        await onThinking({ message: 'Providing general assistance...', step: 1 });
      }

      const chatResult = await handleGeneralChat({
        message,
        conversationHistory,
        model: orchestratorModel,
        onStream,
      });

      return {
        success: true,
        agentType: AgentTypes.GENERAL_CHAT,
        text: chatResult.text,
        streamed: chatResult.streamed,
        tokensUsed: chatResult.tokensUsed,
        orchestrationTimeMs: Date.now() - startTime,
        classification,
      };
    }

    case AgentTypes.DATA_ANALYSIS:
    default: {
      if (onThinking) {
        await onThinking({ message: 'Processing database query...', step: 1 });
      }

      const { processAnalyticsWithAgent } = require('../CloseAI/agentProcessor');
      const analyticsResult = await processAnalyticsWithAgent(
        connectionId,
        message,
        analyticsModel,
        onToolCall,
        onThinking,
        userId,
        originalQuestion || message
      );

      return {
        ...analyticsResult,
        agentType: classification.agentType,
        orchestrationTimeMs: Date.now() - startTime,
        classification,
      };
    }
  }
}

module.exports = {
  AgentTypes,
  classifyIntent,
  orchestrate,
  handleGeneralChat,
  getLLMClient,
};
