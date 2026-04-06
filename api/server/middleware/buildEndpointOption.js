const { handleError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  EndpointURLs,
  EModelEndpoint,
  isAgentsEndpoint,
  parseCompactConvo,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const agents = require('~/server/services/Endpoints/agents');
const { updateFilesUsage } = require('~/models');

const buildFunction = {
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

async function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;
  
  // ⭐ Extract analyticsModel and agentType from req.body BEFORE any parsing
  // createPayload spreads endpointOption into payload, so these are at top level, not in endpointOption
  // Also check req.body.endpointOption in case they're still there
  const originalAnalyticsModel = req.body?.analyticsModel || req.body?.endpointOption?.analyticsModel;
  const originalAgentType = req.body?.agentType || req.body?.endpointOption?.agentType;
  
  // ⭐ Debug: Log original req.body to see what's in it
  console.log('[buildEndpointOption] Checking for analyticsModel and agentType:', {
    endpoint,
    endpointType,
    analyticsModelInBody: req.body?.analyticsModel || 'NOT IN req.body',
    analyticsModelInEndpointOption: req.body?.endpointOption?.analyticsModel || 'NOT IN endpointOption',
    originalAnalyticsModel: originalAnalyticsModel || 'NOT FOUND',
    agentTypeInBody: req.body?.agentType || 'NOT IN req.body',
    agentTypeInEndpointOption: req.body?.endpointOption?.agentType || 'NOT IN endpointOption',
    originalAgentType: originalAgentType || 'NOT FOUND',
    reqBodyKeys: Object.keys(req.body || {}),
    endpointOptionKeys: req.body?.endpointOption ? Object.keys(req.body.endpointOption) : 'NO endpointOption',
  });
  
  // Analytics endpoint should use /api/analytics/chat, not /api/agents/chat
  if (endpoint === EModelEndpoint.analytics) {
    return handleError(res, { 
      text: 'Analytics endpoint should use /api/analytics/chat endpoint' 
    });
  }
  
  let parsedBody;
  try {
    parsedBody = parseCompactConvo({ endpoint, endpointType, conversation: req.body });
  } catch (error) {
    logger.error(`Error parsing compact conversation for endpoint ${endpoint}`, error);
    logger.debug({
      'Error parsing compact conversation': { endpoint, endpointType, conversation: req.body },
    });
    return handleError(res, { text: 'Error parsing conversation' });
  }

  const appConfig = req.config;
  if (appConfig.modelSpecs?.list && appConfig.modelSpecs?.enforce) {
    /** @type {{ list: TModelSpec[] }}*/
    const { list } = appConfig.modelSpecs;
    const { spec } = parsedBody;

    if (!spec) {
      return handleError(res, { text: 'No model spec selected' });
    }

    const currentModelSpec = list.find((s) => s.name === spec);
    if (!currentModelSpec) {
      return handleError(res, { text: 'Invalid model spec' });
    }

    if (endpoint !== currentModelSpec.preset.endpoint) {
      return handleError(res, { text: 'Model spec mismatch' });
    }

    try {
      currentModelSpec.preset.spec = spec;
      parsedBody = parseCompactConvo({
        endpoint,
        endpointType,
        conversation: currentModelSpec.preset,
      });
      if (currentModelSpec.iconURL != null && currentModelSpec.iconURL !== '') {
        parsedBody.iconURL = currentModelSpec.iconURL;
      }
    } catch (error) {
      logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
      return handleError(res, { text: 'Error parsing model spec' });
    }
  } else if (parsedBody.spec && appConfig.modelSpecs?.list) {
    // Non-enforced mode: if spec is selected, derive iconURL from model spec
    const modelSpec = appConfig.modelSpecs.list.find((s) => s.name === parsedBody.spec);
    if (modelSpec?.iconURL) {
      parsedBody.iconURL = modelSpec.iconURL;
    }
  }

  try {
    const isAgents =
      isAgentsEndpoint(endpoint) || req.baseUrl.startsWith(EndpointURLs[EModelEndpoint.agents]);
    const builder = isAgents
      ? (...args) => buildFunction[EModelEndpoint.agents](req, ...args)
      : buildFunction[endpointType ?? endpoint];

    // TODO: use object params
    req.body = req.body || {}; // Express 5: ensure req.body exists
    
    // ⭐ Use the originalAnalyticsModel we already extracted at the beginning of the function
    // This is from req.body.analyticsModel (spread from endpointOption in createPayload)
    
    req.body.endpointOption = await builder(endpoint, parsedBody, endpointType);

    // ⭐ Restore analyticsModel and agentType to the new endpointOption for CloseAI endpoint
    // This ensures these values survive the builder() call
    if (endpoint === EModelEndpoint.closeAI || endpointType === EModelEndpoint.closeAI) {
      if (originalAnalyticsModel) {
        req.body.endpointOption.analyticsModel = originalAnalyticsModel;
        req.body.analyticsModel = originalAnalyticsModel;
        logger.debug('[buildEndpointOption] Preserved analyticsModel for CloseAI:', {
          analyticsModel: originalAnalyticsModel,
        });
      }
      if (originalAgentType) {
        req.body.endpointOption.agentType = originalAgentType;
        req.body.agentType = originalAgentType;
        logger.debug('[buildEndpointOption] Preserved agentType for CloseAI:', {
          agentType: originalAgentType,
        });
      }
      // ⭐ Debug: Console log for easier debugging
      console.log('[buildEndpointOption] Preserved CloseAI options:', {
        endpoint,
        endpointType,
        analyticsModel: originalAnalyticsModel || 'NOT FOUND',
        agentType: originalAgentType || 'NOT FOUND',
        endpointOptionKeys: Object.keys(req.body.endpointOption || {}),
        hasAnalyticsModel: !!req.body.endpointOption?.analyticsModel,
        hasAgentType: !!req.body.endpointOption?.agentType,
      });
    }

    if (req.body.files && !isAgents) {
      req.body.endpointOption.attachments = updateFilesUsage(req.body.files);
    }

    next();
  } catch (error) {
    logger.error(
      `Error building endpoint option for endpoint ${endpoint} with type ${endpointType}`,
      error,
    );
    return handleError(res, { text: 'Error building endpoint option' });
  }
}

module.exports = buildEndpointOption;
