const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { handleCloseAIChatCompletion } = require('~/server/services/CloseAI/service');
const { checkQueryLimit } = require('~/server/middleware/checkQueryLimit');

const router = express.Router();

/**
 * Middleware to extract user ID from header and set req.user
 */
const extractUser = (req, res, next) => {
  const userIdFromHeader = req.headers['x-user-id'] || req.headers['X-User-Id'];
  console.log('[CloseAI Route] extractUser - x-user-id header:', userIdFromHeader);
  if (userIdFromHeader) {
    req.user = { id: userIdFromHeader };
  } else {
    console.log('[CloseAI Route] extractUser - NO x-user-id header found. Headers:', Object.keys(req.headers).filter(h => h.toLowerCase().startsWith('x-')));
  }
  next();
};

router.post('/v1/chat/completions', extractUser, async (req, res) => {
  // ⭐ Extract analyticsModel from custom header (set by agents controller/OpenAI client interceptor)
  // The agents controller stores analyticsModel in req.body, but when OpenAI client makes
  // the HTTP request, we need to pass it via a custom header
  const analyticsModelFromHeader = req.headers['x-analytics-model'] || req.headers['X-Analytics-Model'];

  // ⭐ Also check req.body.analyticsModel directly (it might be in the body from the HTTP request)
  // The OpenAI client might send custom fields in the body if configured to do so
  // Check if the key exists and has a truthy value (not null, undefined, or empty string)
  const analyticsModelFromBody = (req.body && 'analyticsModel' in req.body && req.body.analyticsModel) ? req.body.analyticsModel : null;

  // Also check req.body.endpointOption (if somehow still present)
  const analyticsModelFromEndpointOption = req.body?.endpointOption?.analyticsModel || null;

  // Store in req.body for use in handleCloseAIChatCompletion (prioritize header, then body, then endpointOption)
  req.body.analyticsModel = analyticsModelFromHeader || analyticsModelFromBody || analyticsModelFromEndpointOption || null;

  // ⭐ Extract agentType from request (similar to analyticsModel)
  const agentTypeFromHeader = req.headers['x-agent-type'] || req.headers['X-Agent-Type'];
  const agentTypeFromBody = (req.body && 'agentType' in req.body && req.body.agentType) ? req.body.agentType : null;
  const agentTypeFromEndpointOption = req.body?.endpointOption?.agentType || null;
  req.body.agentType = agentTypeFromHeader || agentTypeFromBody || agentTypeFromEndpointOption || null;

  logger.info('[CloseAI Route]⛈️⛈️⛈️⛈️⛈️ Chat completion request received:⛈️⛈️⛈️ routes/index.js -> post - /v1/chat/completions⛈️⛈️⛈️', {
    model: req.body.model,
    stream: req.body.stream,
    messagesCount: req.body.messages?.length,
    analyticsModel: req.body.analyticsModel || 'NOT PROVIDED', // ⭐ Debug: Log analyticsModel from request
    agentType: req.body.agentType || 'NOT PROVIDED', // ⭐ Debug: Log agentType from request
  });
  // ⭐ Debug: Console log for easier debugging - include all headers to see what's available
  console.log('[CloseAI Route] Request received:⛈️⛈️⛈️post - /v1/chat/completions⛈️⛈️⛈️', {
    model: req.body.model,
    analyticsModel: req.body.analyticsModel || 'NOT PROVIDED',
    hasAnalyticsModel: !!req.body.analyticsModel,
    analyticsModelFromHeader: analyticsModelFromHeader || 'NOT IN HEADER',
    analyticsModelFromBody: analyticsModelFromBody || 'NOT IN BODY',
    analyticsModelFromEndpointOption: analyticsModelFromEndpointOption || 'NOT IN endpointOption',
    agentType: req.body.agentType || 'NOT PROVIDED',
    hasAgentType: !!req.body.agentType,
    agentTypeFromHeader: agentTypeFromHeader || 'NOT IN HEADER',
    agentTypeFromBody: agentTypeFromBody || 'NOT IN BODY',
    agentTypeFromEndpointOption: agentTypeFromEndpointOption || 'NOT IN endpointOption',
    allHeadersWithX: Object.keys(req.headers).filter(h => h.toLowerCase().startsWith('x-')),
    reqBodyKeys: Object.keys(req.body),
    reqBodyAnalyticsModel: req.body?.analyticsModel || 'NOT IN req.body DIRECTLY',
    reqBodyAgentType: req.body?.agentType || 'NOT IN req.body DIRECTLY',
  });

  await handleCloseAIChatCompletion(req, res);
});

/**
 * @route GET /v1/models
 * @desc Return available models (mimics OpenAI API)
 * @access Public
 */
router.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'gpt-5.2',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'closeai',
      },
    ],
  });
});

module.exports = router;

