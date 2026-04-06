const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
} = require('@librechat/api');
const { DatabaseConnection } = require('~/db/models');
const { isSampleDbEnabled } = require('~/server/services/Analytics/sampleDbService');

/**
 * Loads the default models for the application.
 * @async
 * @function
 * @param {ServerRequest} req - The Express request object.
 */
async function loadDefaultModels(req) {
  try {
    const [openAI, closeAI, anthropic, azureOpenAI, assistants, azureAssistants, google, bedrock, analyticsConnections] =
      await Promise.all([
        getOpenAIModels({ user: req.user.id }).catch((error) => {
          logger.error('Error fetching OpenAI models:', error);
          return [];
        }),
        (async () => {
          try {
            // Get analytics connections only (removed dummy gpt-5.2 option)
            let connectionModels = [];
            if (req.user?.id) {
              try {
                const connections = await DatabaseConnection.find({
                  createdBy: req.user.id,
                  isActive: true
                })
                  .select('_id name type')
                  .lean();
                // Return connection IDs as model names
                connectionModels = connections.map((conn) => conn._id.toString());
                logger.info(`[loadDefaultModels] Found ${connectionModels.length} analytics connections for closeAI:`, {
                  connections: connections.map(c => ({ id: c._id.toString(), name: c.name, type: c.type }))
                });
              } catch (connError) {
                logger.error('Error fetching Analytics connections for closeAI:', connError);
              }
            }
            
            // Add sample database if enabled
            if (isSampleDbEnabled()) {
              connectionModels.unshift('sample-db');
              logger.info('[loadDefaultModels] Added sample database to closeAI models');
            }
            
            // Return only connection IDs (no dummy gpt-5.2)
            return connectionModels;
          } catch (error) {
            logger.error('Error fetching CloseAI models:', error);
            return []; // Return empty array instead of dummy gpt-5.2
          }
        })(),
        getAnthropicModels({ user: req.user.id }).catch((error) => {
          logger.error('Error fetching Anthropic models:', error);
          return [];
        }),
        getOpenAIModels({ user: req.user.id, azure: true }).catch((error) => {
          logger.error('Error fetching Azure OpenAI models:', error);
          return [];
        }),
        getOpenAIModels({ assistants: true }).catch((error) => {
          logger.error('Error fetching OpenAI Assistants API models:', error);
          return [];
        }),
        getOpenAIModels({ azureAssistants: true }).catch((error) => {
          logger.error('Error fetching Azure OpenAI Assistants API models:', error);
          return [];
        }),
        Promise.resolve(getGoogleModels()).catch((error) => {
          logger.error('Error getting Google models:', error);
          return [];
        }),
        Promise.resolve(getBedrockModels()).catch((error) => {
          logger.error('Error getting Bedrock models:', error);
          return [];
        }),
        // Load Analytics connections as "models"
        (async () => {
          try {
            if (!req.user?.id) {
              return [];
            }
            // For now, fetch all active connections
            // TODO: Filter by user's organization when organization support is added
            const connections = await DatabaseConnection.find({ isActive: true })
              .select('_id name type')
              .lean();
            // Return connection IDs as model names (similar to how agents work)
            const models = connections.map((conn) => conn._id.toString());
            
            // Add sample database if enabled
            if (isSampleDbEnabled()) {
              models.unshift('sample-db');
            }
            
            return models;
          } catch (error) {
            logger.error('Error fetching Analytics connections:', error);
            return [];
          }
        })(),
      ]);

    return {
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.closeAI]: closeAI,
      [EModelEndpoint.google]: google,
      [EModelEndpoint.anthropic]: anthropic,
      [EModelEndpoint.azureOpenAI]: azureOpenAI,
      [EModelEndpoint.assistants]: assistants,
      [EModelEndpoint.azureAssistants]: azureAssistants,
      [EModelEndpoint.bedrock]: bedrock,
      [EModelEndpoint.analytics]: analyticsConnections,
    };
  } catch (error) {
    logger.error('Error fetching default models:', error);
    throw new Error(`Failed to load default models: ${error.message}`);
  }
}

module.exports = loadDefaultModels;
