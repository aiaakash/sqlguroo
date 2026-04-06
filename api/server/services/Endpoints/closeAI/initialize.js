const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, ErrorTypes } = require('librechat-data-provider');
const { isUserProvided, checkUserKeyExpiry } = require('@librechat/api');
const { getOpenAIConfig } = require('@librechat/api/src/endpoints/openai/config');

/**
 * Initializes CloseAI options for agent usage.
 * This function returns configuration options that point to our custom CloseAI backend service.
 *
 * @param {Object} params - Configuration parameters
 * @param {ServerRequest} params.req - The Express request object
 * @param {string} params.endpoint - The endpoint name (should be 'closeAI')
 * @param {Object} params.model_parameters - Model parameters including model name
 * @param {Object} params.db - Database instance for user key lookups
 * @returns {Promise<InitializeResultBase>} Configuration options for CloseAI
 */
async function initializeCloseAI({ req, endpoint, model_parameters, db }) {
  // ⭐ Debug: Log that initializeCloseAI is being called
  console.log('[CloseAI Initialize] Function called:', {
    endpoint,
    model_parametersKeys: model_parameters ? Object.keys(model_parameters) : 'NO model_parameters',
    analyticsModelInModelParams: model_parameters?.analyticsModel || 'NOT IN model_parameters',
  });

  const appConfig = req.config;
  const { PROXY, CLOSEAI_API_KEY, CLOSEAI_BASE_URL } = process.env;

  // Default to same server (localhost) backend service if not configured
  // The CloseAI service runs on the same Express app at /v1/chat/completions
  const PORT = process.env.PORT || 3080;
  const HOST = process.env.HOST || 'localhost';
  const defaultBaseURL = CLOSEAI_BASE_URL || `http://${HOST}:${PORT}/v1`;

  const { key: expiresAt } = req.body;
  const modelName = model_parameters?.model;

  const userProvidesKey = isUserProvided(CLOSEAI_API_KEY);
  const userProvidesURL = isUserProvided(CLOSEAI_BASE_URL);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  let apiKey = userProvidesKey
    ? userValues?.apiKey
    : CLOSEAI_API_KEY || 'closeai-dummy-key'; // Dummy key for now, can be configured later

  const baseURL = userProvidesURL
    ? userValues?.baseURL
    : defaultBaseURL;

  if (userProvidesKey && !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  const modelOptions = {
    ...(model_parameters || {}),
    model: modelName || 'gpt-5.2',
    user: req.user?.id,
  };

  // ⭐ Extract analyticsModel from endpointOption and pass via custom header
  // This is needed because the OpenAI client only sends standard fields in the request body
  const analyticsModel = req.body?.endpointOption?.analyticsModel || req.body?.analyticsModel || model_parameters?.analyticsModel;
  
  // ⭐ Extract agentType from endpointOption and pass via custom header
  const agentType = req.body?.endpointOption?.agentType || req.body?.agentType || model_parameters?.agentType;

  // ⭐ Debug: Log all possible sources of analyticsModel and agentType
  console.log('[CloseAI Initialize] Extracting analyticsModel and agentType:', {
    fromEndpointOption: req.body?.endpointOption?.analyticsModel || 'NOT IN endpointOption',
    fromReqBody: req.body?.analyticsModel || 'NOT IN req.body',
    fromModelParameters: model_parameters?.analyticsModel || 'NOT IN model_parameters',
    finalAnalyticsModel: analyticsModel || 'NOT PROVIDED',
    agentTypeFromEndpointOption: req.body?.endpointOption?.agentType || 'NOT IN endpointOption',
    agentTypeFromReqBody: req.body?.agentType || 'NOT IN req.body',
    agentTypeFromModelParameters: model_parameters?.agentType || 'NOT IN model_parameters',
    finalAgentType: agentType || 'NOT PROVIDED',
    endpointOptionKeys: req.body?.endpointOption ? Object.keys(req.body.endpointOption) : 'NO endpointOption',
    reqBodyKeys: Object.keys(req.body || {}),
  });

  const clientOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: baseURL,
    streaming: true,
    modelOptions,
    // ⭐ Add analyticsModel and agentType as custom headers so they reach the CloseAI route
    headers: {
      ...(analyticsModel ? { 'x-analytics-model': analyticsModel } : {}),
      ...(agentType ? { 'x-agent-type': agentType } : {}),
      ...(req.user?.id ? { 'x-user-id': req.user.id } : {}),
    },
  };

  // ⭐ Debug: Log if analyticsModel and agentType are being passed via header
  if (analyticsModel || agentType) {
    logger.debug('[CloseAI] Passing headers:', { analyticsModel, agentType });
    console.log('[CloseAI Initialize] Passing headers:', { analyticsModel, agentType, headers: clientOptions.headers });
  } else {
    console.log('[CloseAI Initialize] analyticsModel and agentType NOT FOUND - will use fallbacks');
  }

  // Use the same OpenAI config function since CloseAI will mimic OpenAI's API format
  const options = getOpenAIConfig(apiKey, clientOptions, endpoint);

  // Set stream rate (similar to OpenAI)
  const closeAIConfig = appConfig?.endpoints?.[EModelEndpoint.closeAI];
  const allConfig = appConfig?.endpoints?.all;
  const streamRate = closeAIConfig?.streamRate || allConfig?.streamRate || 20;

  if (streamRate) {
    options.llmConfig._lc_stream_delay = streamRate;
  }

  logger.debug('[CloseAI] Initialized with baseURL:', baseURL);

  return options;
}

module.exports = initializeCloseAI;

