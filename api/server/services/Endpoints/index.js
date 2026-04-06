const { Providers } = require('@librechat/agents');
const { EModelEndpoint } = require('librechat-data-provider');
const { getCustomEndpointConfig } = require('@librechat/api');
const initAnthropic = require('~/server/services/Endpoints/anthropic/initialize');
const getBedrockOptions = require('~/server/services/Endpoints/bedrock/options');
const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
const initCloseAI = require('~/server/services/Endpoints/closeAI/initialize');
const initCustom = require('~/server/services/Endpoints/custom/initialize');
const initGoogle = require('~/server/services/Endpoints/google/initialize');

/** Check if the provider is a known custom provider
 * @param {string | undefined} [provider] - The provider string
 * @returns {boolean} - True if the provider is a known custom provider, false otherwise
 */
function isKnownCustomProvider(provider) {
  return [Providers.XAI, Providers.DEEPSEEK, Providers.OPENROUTER].includes(
    provider?.toLowerCase() || '',
  );
}

const providerConfigMap = {
  [Providers.XAI]: initCustom,
  [Providers.DEEPSEEK]: initCustom,
  [Providers.OPENROUTER]: initCustom,
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.closeAI]: initCloseAI, // Use dedicated CloseAI initialization
  [EModelEndpoint.google]: initGoogle,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
};

/**
 * Get the provider configuration and override endpoint based on the provider string
 * @param {Object} params
 * @param {string} params.provider - The provider string
 * @param {AppConfig} params.appConfig - The application configuration
 * @returns {{
 * getOptions: (typeof providerConfigMap)[keyof typeof providerConfigMap],
 * overrideProvider: string,
 * customEndpointConfig?: TEndpoint
 * }}
 */
function getProviderConfig({ provider, appConfig }) {
  const { logger } = require('@librechat/data-schemas');
  
  // Analytics endpoint should not use provider config - it has its own route handler
  if (provider === EModelEndpoint.analytics) {
    throw new Error('Analytics endpoint should use /api/analytics/chat, not agent controller');
  }

  logger.debug('[getProviderConfig] Looking up provider:', { 
    provider, 
    type: typeof provider,
    enumValue: EModelEndpoint.closeAI,
    mapHasProvider: provider in providerConfigMap,
    mapKeys: Object.keys(providerConfigMap)
  });

  let getOptions = providerConfigMap[provider];
  let overrideProvider = provider;
  /** @type {TEndpoint | undefined} */
  let customEndpointConfig;

  // Try exact match first (including enum values)
  if (!getOptions) {
    // Also try with the enum value directly if provider is a string
    if (provider === 'closeAI' || provider === EModelEndpoint.closeAI) {
      getOptions = providerConfigMap[EModelEndpoint.closeAI];
      if (getOptions) {
        overrideProvider = EModelEndpoint.closeAI;
        logger.debug('[getProviderConfig] Found closeAI via enum value');
      }
    }
  }

  // Try case-insensitive lookup for known endpoints
  if (!getOptions) {
    const providerLower = provider?.toLowerCase();
    const knownEndpoints = {
      'closeai': EModelEndpoint.closeAI,
      'openai': EModelEndpoint.openAI,
      'google': EModelEndpoint.google,
      'anthropic': EModelEndpoint.anthropic,
      'azureopenai': EModelEndpoint.azureOpenAI,
      'bedrock': EModelEndpoint.bedrock,
    };
    
    logger.debug('[getProviderConfig] Trying known endpoints lookup:', { providerLower, enumValue: knownEndpoints[providerLower] });
    
    if (knownEndpoints[providerLower]) {
      const enumValue = knownEndpoints[providerLower];
      getOptions = providerConfigMap[enumValue];
      if (getOptions) {
        overrideProvider = enumValue;
        logger.debug('[getProviderConfig] Found via known endpoints:', { enumValue, overrideProvider });
      }
    }
  } else {
    logger.debug('[getProviderConfig] Found via exact match');
  }

  // Try lowercase lookup (for Providers enum values)
  if (!getOptions && providerConfigMap[provider?.toLowerCase()] != null) {
    overrideProvider = provider.toLowerCase();
    getOptions = providerConfigMap[overrideProvider];
    logger.debug('[getProviderConfig] Found via lowercase lookup:', { overrideProvider });
  } else if (!getOptions) {
    logger.debug('[getProviderConfig] Trying custom endpoint config');
    customEndpointConfig = getCustomEndpointConfig({ endpoint: provider, appConfig });
    if (!customEndpointConfig) {
      logger.error('[getProviderConfig] Provider not found:', { 
        provider, 
        availableKeys: Object.keys(providerConfigMap),
        enumValue: EModelEndpoint.closeAI 
      });
      throw new Error(`Provider ${provider} not supported`);
    }
    getOptions = initCustom;
    overrideProvider = Providers.OPENAI;
  }

  logger.debug('[getProviderConfig] Final result:', { overrideProvider, hasGetOptions: !!getOptions });

  if (isKnownCustomProvider(overrideProvider) && !customEndpointConfig) {
    customEndpointConfig = getCustomEndpointConfig({ endpoint: provider, appConfig });
    if (!customEndpointConfig) {
      throw new Error(`Provider ${provider} not supported`);
    }
  }

  return {
    getOptions,
    overrideProvider,
    customEndpointConfig,
  };
}

module.exports = {
  getProviderConfig,
};
