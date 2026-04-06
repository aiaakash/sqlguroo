import { ErrorTypes, EModelEndpoint, mapModelToAzureConfig } from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  InitializeResultBase,
  OpenAIConfigOptions,
  UserKeyValues,
} from '~/types';
import { getAzureCredentials, resolveHeaders, isUserProvided, checkUserKeyExpiry } from '~/utils';
import { getOpenAIConfig } from './config';

/**
 * Initializes OpenAI options for agent usage. This function always returns configuration
 * options and never creates a client instance (equivalent to optionsOnly=true behavior).
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to OpenAI configuration options
 * @throws Error if API key is missing or user key has expired
 */
export async function initializeOpenAI({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  // ⭐ Debug: Log that initializeOpenAI is being called
  console.log('[initializeOpenAI] Function called:', {
    endpoint,
    model_parametersKeys: model_parameters ? Object.keys(model_parameters) : 'NO model_parameters',
    analyticsModelInModelParams: model_parameters?.analyticsModel || 'NOT IN model_parameters',
    isCloseAI: endpoint === EModelEndpoint.closeAI,
  });

  const appConfig = req.config;
  const { PROXY, OPENAI_API_KEY, AZURE_API_KEY, OPENAI_REVERSE_PROXY, AZURE_OPENAI_BASEURL, CLOSEAI_BASE_URL, PORT, HOST } =
    process.env;

  const { key: expiresAt } = req.body;
  const modelName = model_parameters?.model as string | undefined;

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.closeAI]: OPENAI_API_KEY, // CloseAI uses same API key for now
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  // For closeAI, use custom backend service URL (defaults to same server)
  const closeAIBaseURL = CLOSEAI_BASE_URL || (PORT && HOST ? `http://${HOST}:${PORT}/v1` : `http://localhost:3080/v1`);

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.closeAI]: closeAIBaseURL, // CloseAI uses custom backend service
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const userProvidesKey = isUserProvided(credentials[endpoint as keyof typeof credentials]);
  const userProvidesURL = isUserProvided(baseURLOptions[endpoint as keyof typeof baseURLOptions]);

  let userValues: UserKeyValues | null = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  let apiKey = userProvidesKey
    ? userValues?.apiKey
    : credentials[endpoint as keyof typeof credentials];
  const baseURL = userProvidesURL
    ? userValues?.baseURL
    : baseURLOptions[endpoint as keyof typeof baseURLOptions];

  const clientOptions: OpenAIConfigOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: baseURL || undefined,
    streaming: true,
  };

  const isAzureOpenAI = endpoint === EModelEndpoint.azureOpenAI;
  const azureConfig = isAzureOpenAI && appConfig?.endpoints?.[EModelEndpoint.azureOpenAI];
  let isServerless = false;

  if (isAzureOpenAI && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL: configBaseURL,
      headers = {},
      serverless,
    } = mapModelToAzureConfig({
      modelName: modelName || '',
      modelGroupMap,
      groupMap,
    });
    isServerless = serverless === true;

    clientOptions.reverseProxyUrl = configBaseURL ?? clientOptions.reverseProxyUrl;
    clientOptions.headers = resolveHeaders({
      headers: { ...headers, ...(clientOptions.headers ?? {}) },
      user: req.user,
    });

    const groupName = modelGroupMap[modelName || '']?.group;
    if (groupName && groupMap[groupName]) {
      clientOptions.addParams = groupMap[groupName]?.addParams;
      clientOptions.dropParams = groupMap[groupName]?.dropParams;
    }

    apiKey = azureOptions.azureOpenAIApiKey;
    clientOptions.azure = !isServerless ? azureOptions : undefined;

    if (isServerless) {
      clientOptions.defaultQuery = azureOptions.azureOpenAIApiVersion
        ? { 'api-version': azureOptions.azureOpenAIApiVersion }
        : undefined;

      if (!clientOptions.headers) {
        clientOptions.headers = {};
      }
      clientOptions.headers['api-key'] = apiKey;
    }
  } else if (isAzureOpenAI) {
    clientOptions.azure =
      userProvidesKey && userValues?.apiKey ? JSON.parse(userValues.apiKey) : getAzureCredentials();
    apiKey = clientOptions.azure ? clientOptions.azure.azureOpenAIApiKey : undefined;
  }

  if (userProvidesKey && !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API Key not provided.`);
  }

  const modelOptions = {
    ...(model_parameters ?? {}),
    model: modelName,
    user: req.user?.id,
  };

  // ⭐ For CloseAI endpoint, extract analyticsModel and agentType from model_parameters and pass via custom header
  // This is needed because the OpenAI client only sends standard fields in the request body
  let headers = clientOptions.headers;
  if (endpoint === EModelEndpoint.closeAI) {
    const analyticsModelValue = model_parameters?.analyticsModel
      ? typeof model_parameters.analyticsModel === 'string'
        ? model_parameters.analyticsModel
        : String(model_parameters.analyticsModel)
      : undefined;
    
    const agentTypeValue = model_parameters?.agentType
      ? typeof model_parameters.agentType === 'string'
        ? model_parameters.agentType
        : String(model_parameters.agentType)
      : undefined;

    headers = {
      ...(headers || {}),
      ...(analyticsModelValue ? { 'x-analytics-model': analyticsModelValue } : {}),
      ...(agentTypeValue ? { 'x-agent-type': agentTypeValue } : {}),
      ...(req.user?.id ? { 'x-user-id': req.user.id } : {}),
    };

    console.log('[initializeOpenAI] CloseAI: Adding custom headers:', {
      analyticsModel: analyticsModelValue,
      agentType: agentTypeValue,
      userId: req.user?.id,
      headers,
    });
  }

  const finalClientOptions: OpenAIConfigOptions = {
    ...clientOptions,
    modelOptions,
    headers,
  };

  const options = getOpenAIConfig(apiKey, finalClientOptions, endpoint);

  /** Set useLegacyContent for Azure serverless deployments */
  if (isServerless) {
    (options as InitializeResultBase).useLegacyContent = true;
  }

  const openAIConfig = appConfig?.endpoints?.[EModelEndpoint.openAI];
  const allConfig = appConfig?.endpoints?.all;
  const azureRate = modelName?.includes('gpt-4') ? 30 : 17;

  let streamRate: number | undefined;

  if (isAzureOpenAI && azureConfig) {
    streamRate = azureConfig.streamRate ?? azureRate;
  } else if (!isAzureOpenAI && openAIConfig) {
    streamRate = openAIConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    streamRate = allConfig.streamRate;
  }

  if (streamRate) {
    options.llmConfig._lc_stream_delay = streamRate;
  }

  return options;
}
