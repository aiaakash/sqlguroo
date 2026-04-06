const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');

const openRouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const CONFIG = {
  ENABLED: process.env.CHAT_SUMMARIZER_ENABLED !== 'false',
  MODEL: process.env.CHAT_SUMMARIZER_MODEL || 'xiaomi/mimo-v2-flash',
  MIN_MESSAGES: parseInt(process.env.CHAT_SUMMARIZER_MIN_MESSAGES || '3', 10),
  MAX_HISTORY_LENGTH: parseInt(process.env.CHAT_SUMMARIZER_MAX_HISTORY_LENGTH || '4000', 10),
  MAX_SUMMARY_LENGTH: parseInt(process.env.CHAT_SUMMARIZER_MAX_SUMMARY_LENGTH || '800', 10),
};

function extractTextFromMessage(message) {
  if (typeof message === 'string') return message;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part.type === 'text' && part.text) return part.text;
        if (part.text) return part.text;
        return '';
      })
      .filter((text) => text)
      .join(' ');
  }
  if (message.content && typeof message.content === 'object') {
    return message.content.text || message.content.content || '';
  }
  return '';
}

function extractSqlFromResponse(content) {
  if (!content) return null;

  const sqlMatch = content.match(/```sql\s*([\s\S]*?)```/i);
  if (sqlMatch) return sqlMatch[1].trim().substring(0, 200);

  const sqlMatch2 = content.match(
    /\*\*Generated SQL Query[^*]*\*\*[\s\S]*?```sql\s*([\s\S]*?)```/i,
  );
  if (sqlMatch2) return sqlMatch2[1].trim().substring(0, 200);

  return null;
}

function extractKeyInsights(content) {
  if (!content) return [];

  const insights = [];

  const bulletMatches = content.match(/^[-*•]\s*.{10,150}$/gm);
  if (bulletMatches) {
    bulletMatches.slice(0, 5).forEach((m) => {
      insights.push(m.replace(/^[-*•]\s*/, '').trim());
    });
  }

  const numberMatches = content.match(/\d+(?:\.\d+)?%|\d{1,3}(?:,\d{3})*/g);
  if (numberMatches && numberMatches.length > 0) {
    const contextMatches = content.match(/[^.]*\d+(?:\.\d+)?%[^.]*\./g);
    if (contextMatches) {
      contextMatches.slice(0, 3).forEach((m) => {
        if (!insights.includes(m.trim())) {
          insights.push(m.trim());
        }
      });
    }
  }

  return insights.slice(0, 5);
}

function compressMessage(message) {
  const content = extractTextFromMessage(message);
  if (!content) return null;

  const sql = extractSqlFromResponse(content);
  const insights = extractKeyInsights(content);

  const isUser = message.role === 'user';
  const preview = content.substring(0, isUser ? 200 : 100);

  if (isUser) {
    return {
      role: 'user',
      question: preview,
    };
  }

  return {
    role: 'assistant',
    sql: sql || undefined,
    insights: insights.length > 0 ? insights : undefined,
    preview: preview,
  };
}

async function summarizeWithLLM(compressedMessages, currentQuestion) {
  const model = CONFIG.MODEL;

  const systemPrompt = `You are a conversation summarizer for a database analytics assistant.
Your task is to create a concise summary of the conversation history that preserves:
1. What questions were asked
2. What SQL queries were executed (brief form)
3. Key insights and findings

Keep the summary under ${CONFIG.MAX_SUMMARY_LENGTH} characters.
Format as a brief bulleted list. Focus on data patterns, not formatting details.`;

  const historyText = compressedMessages
    .map((m, i) => {
      if (m.role === 'user') {
        return `[Q${i + 1}]: ${m.question}`;
      }
      let parts = [`[A${i + 1}]:`];
      if (m.sql) parts.push(`SQL: ${m.sql.substring(0, 100)}...`);
      if (m.insights && m.insights.length > 0) {
        parts.push(`Insights: ${m.insights.slice(0, 2).join('; ')}`);
      }
      return parts.join(' ');
    })
    .join('\n');

  const userPrompt = `Previous conversation:
${historyText}

Current question: ${currentQuestion}

Summarize the conversation history to provide context for the current question. Focus on what data was queried and what was found.`;

  try {
    logger.info('[ChatSummarizer] Summarizing with model:', model);

    const response = await openRouter.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const summary = response.choices[0]?.message?.content || '';
    logger.info('[ChatSummarizer] Summary generated:', {
      length: summary.length,
      model,
    });

    return summary;
  } catch (error) {
    logger.error('[ChatSummarizer] LLM summarization failed:', error.message);
    return null;
  }
}

function createSimpleSummary(compressedMessages) {
  const lines = compressedMessages.map((m, i) => {
    if (m.role === 'user') {
      return `Q${Math.ceil((i + 1) / 2)}: "${m.question?.substring(0, 80)}"`;
    }
    const parts = [];
    if (m.sql) parts.push(`SQL used`);
    if (m.insights?.length) parts.push(`${m.insights.length} insights`);
    return `A${Math.floor((i + 1) / 2)}: ${parts.join(', ') || 'responded'}`;
  });

  return `[Previous Context]\n${lines.join('\n')}`;
}

async function summarizeConversationHistory(messages, options = {}) {
  if (!CONFIG.ENABLED) {
    return null;
  }

  const { currentQuestion = '', forceSummarize = false } = options;

  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length < CONFIG.MIN_MESSAGES && !forceSummarize) {
    logger.info('[ChatSummarizer] Not enough messages to summarize:', {
      userMessageCount: userMessages.length,
      minRequired: CONFIG.MIN_MESSAGES,
    });
    return null;
  }

  const historyMessages = messages.slice(0, -1);
  if (historyMessages.length === 0) {
    return null;
  }

  const totalLength = historyMessages.reduce((sum, m) => {
    const text = extractTextFromMessage(m);
    return sum + text.length;
  }, 0);

  if (totalLength < CONFIG.MAX_HISTORY_LENGTH && !forceSummarize) {
    logger.info('[ChatSummarizer] History under threshold, no summarization needed:', {
      totalLength,
      threshold: CONFIG.MAX_HISTORY_LENGTH,
    });
    return null;
  }

  logger.info('[ChatSummarizer] Starting summarization:', {
    messageCount: historyMessages.length,
    totalLength,
    threshold: CONFIG.MAX_HISTORY_LENGTH,
  });

  const compressedMessages = historyMessages.map(compressMessage).filter(Boolean);

  let summary;
  try {
    summary = await summarizeWithLLM(compressedMessages, currentQuestion);
  } catch (error) {
    logger.error('[ChatSummarizer] Error during LLM summarization:', error);
  }

  if (!summary) {
    summary = createSimpleSummary(compressedMessages);
    logger.info('[ChatSummarizer] Using simple summary fallback');
  }

  return {
    summary,
    compressedMessages,
    originalLength: totalLength,
    compressedLength: summary.length,
    compressionRatio: totalLength > 0 ? (summary.length / totalLength).toFixed(2) : 0,
  };
}

function buildContextWithSummary(summary, currentMessage) {
  if (!summary) {
    return currentMessage;
  }

  return `[Conversation Summary]
${summary.summary}

[Current Question]
${currentMessage}`;
}

module.exports = {
  summarizeConversationHistory,
  buildContextWithSummary,
  extractTextFromMessage,
  compressMessage,
  CONFIG,
};
