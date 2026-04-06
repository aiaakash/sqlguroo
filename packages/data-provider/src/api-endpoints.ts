import type { AssistantsEndpoint } from './schemas';
import * as q from './types/queries';
import { ResourceType } from './accessPermissions';

let BASE_URL = '';
if (
  typeof process === 'undefined' ||
  (process as typeof process & { browser?: boolean }).browser === true
) {
  // process is only available in node context, or process.browser is true in client-side code
  // This is to ensure that the BASE_URL is set correctly based on the <base>
  // element in the HTML document, if it exists.
  const baseEl = document.querySelector('base');
  BASE_URL = baseEl?.getAttribute('href') || '/';
}

if (BASE_URL && BASE_URL.endsWith('/')) {
  BASE_URL = BASE_URL.slice(0, -1);
}

export const apiBaseUrl = () => BASE_URL;

// Testing this buildQuery function
const buildQuery = (params: Record<string, unknown>): string => {
  const query = Object.entries(params)
    .filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== '';
    })
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
      }
      return `${key}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
  return query ? `?${query}` : '';
};

export const health = () => `${BASE_URL}/health`;
export const user = () => `${BASE_URL}/api/user`;

export const balance = () => `${BASE_URL}/api/balance`;

export const userPlugins = () => `${BASE_URL}/api/user/plugins`;

export const deleteUser = () => `${BASE_URL}/api/user/delete`;

const messagesRoot = `${BASE_URL}/api/messages`;

export const messages = (params: q.MessagesListParams) => {
  const { conversationId, messageId, ...rest } = params;

  if (conversationId && messageId) {
    return `${messagesRoot}/${conversationId}/${messageId}`;
  }

  if (conversationId) {
    return `${messagesRoot}/${conversationId}`;
  }

  return `${messagesRoot}${buildQuery(rest)}`;
};

export const messagesArtifacts = (messageId: string) => `${messagesRoot}/artifact/${messageId}`;

export const messagesBranch = () => `${messagesRoot}/branch`;

const shareRoot = `${BASE_URL}/api/share`;
export const shareMessages = (shareId: string) => `${shareRoot}/${shareId}`;
export const getSharedLink = (conversationId: string) => `${shareRoot}/link/${conversationId}`;
export const getSharedLinks = (
  pageSize: number,
  isPublic: boolean,
  sortBy: 'title' | 'createdAt',
  sortDirection: 'asc' | 'desc',
  search?: string,
  cursor?: string,
) =>
  `${shareRoot}?pageSize=${pageSize}&isPublic=${isPublic}&sortBy=${sortBy}&sortDirection=${sortDirection}${
    search ? `&search=${search}` : ''
  }${cursor ? `&cursor=${cursor}` : ''}`;
export const createSharedLink = (conversationId: string) => `${shareRoot}/${conversationId}`;
export const updateSharedLink = (shareId: string) => `${shareRoot}/${shareId}`;

const keysEndpoint = `${BASE_URL}/api/keys`;

export const keys = () => keysEndpoint;

export const userKeyQuery = (name: string) => `${keysEndpoint}?name=${name}`;

export const revokeUserKey = (name: string) => `${keysEndpoint}/${name}`;

export const revokeAllUserKeys = () => `${keysEndpoint}?all=true`;

export const conversationsRoot = `${BASE_URL}/api/convos`;

export const conversations = (params: q.ConversationListParams) => {
  return `${conversationsRoot}${buildQuery(params)}`;
};

export const conversationById = (id: string) => `${conversationsRoot}/${id}`;

export const genTitle = (conversationId: string) =>
  `${conversationsRoot}/gen_title/${encodeURIComponent(conversationId)}`;

export const updateConversation = () => `${conversationsRoot}/update`;

export const deleteConversation = () => `${conversationsRoot}`;

export const deleteAllConversation = () => `${conversationsRoot}/all`;

export const importConversation = () => `${conversationsRoot}/import`;

export const forkConversation = () => `${conversationsRoot}/fork`;

export const duplicateConversation = () => `${conversationsRoot}/duplicate`;

export const search = (q: string, cursor?: string | null) =>
  `${BASE_URL}/api/search?q=${q}${cursor ? `&cursor=${cursor}` : ''}`;

export const searchEnabled = () => `${BASE_URL}/api/search/enable`;

export const presets = () => `${BASE_URL}/api/presets`;

export const deletePreset = () => `${BASE_URL}/api/presets/delete`;

export const aiEndpoints = () => `${BASE_URL}/api/endpoints`;

export const models = () => `${BASE_URL}/api/models`;

export const tokenizer = () => `${BASE_URL}/api/tokenizer`;

export const login = () => `${BASE_URL}/api/auth/login`;

export const logout = () => `${BASE_URL}/api/auth/logout`;

export const register = () => `${BASE_URL}/api/auth/register`;

export const loginFacebook = () => `${BASE_URL}/api/auth/facebook`;

export const loginGoogle = () => `${BASE_URL}/api/auth/google`;

export const refreshToken = (retry?: boolean) =>
  `${BASE_URL}/api/auth/refresh${retry === true ? '?retry=true' : ''}`;

export const requestPasswordReset = () => `${BASE_URL}/api/auth/requestPasswordReset`;

export const resetPassword = () => `${BASE_URL}/api/auth/resetPassword`;

export const verifyEmail = () => `${BASE_URL}/api/user/verify`;

// Auth page URLs (for client-side navigation and redirects)
export const loginPage = () => `${BASE_URL}/login`;
export const registerPage = () => `${BASE_URL}/register`;

export const resendVerificationEmail = () => `${BASE_URL}/api/user/verify/resend`;

export const plugins = () => `${BASE_URL}/api/plugins`;

export const mcpReinitialize = (serverName: string) =>
  `${BASE_URL}/api/mcp/${serverName}/reinitialize`;
export const mcpConnectionStatus = () => `${BASE_URL}/api/mcp/connection/status`;
export const mcpServerConnectionStatus = (serverName: string) =>
  `${BASE_URL}/api/mcp/connection/status/${serverName}`;
export const mcpAuthValues = (serverName: string) => {
  return `${BASE_URL}/api/mcp/${serverName}/auth-values`;
};

export const cancelMCPOAuth = (serverName: string) => {
  return `${BASE_URL}/api/mcp/oauth/cancel/${serverName}`;
};

export const config = () => `${BASE_URL}/api/config`;

export const prompts = () => `${BASE_URL}/api/prompts`;

export const addPromptToGroup = (groupId: string) =>
  `${BASE_URL}/api/prompts/groups/${groupId}/prompts`;

export const assistants = ({
  path = '',
  options,
  version,
  endpoint,
  isAvatar,
}: {
  path?: string;
  options?: object;
  endpoint?: AssistantsEndpoint;
  version: number | string;
  isAvatar?: boolean;
}) => {
  let url = isAvatar === true ? `${images()}/assistants` : `${BASE_URL}/api/assistants/v${version}`;

  if (path && path !== '') {
    url += `/${path}`;
  }

  if (endpoint) {
    options = {
      ...(options ?? {}),
      endpoint,
    };
  }

  if (options && Object.keys(options).length > 0) {
    const queryParams = new URLSearchParams(options as Record<string, string>).toString();
    url += `?${queryParams}`;
  }

  return url;
};

export const agents = ({ path = '', options }: { path?: string; options?: object }) => {
  let url = `${BASE_URL}/api/agents`;

  if (path && path !== '') {
    url += `/${path}`;
  }

  if (options && Object.keys(options).length > 0) {
    const queryParams = new URLSearchParams(options as Record<string, string>).toString();
    url += `?${queryParams}`;
  }

  return url;
};

export const activeJobs = () => `${BASE_URL}/api/agents/chat/active`;

export const mcp = {
  tools: `${BASE_URL}/api/mcp/tools`,
  servers: `${BASE_URL}/api/mcp/servers`,
};

export const mcpServer = (serverName: string) => `${BASE_URL}/api/mcp/servers/${serverName}`;

export const revertAgentVersion = (agent_id: string) => `${agents({ path: `${agent_id}/revert` })}`;

export const files = () => `${BASE_URL}/api/files`;
export const fileUpload = () => `${BASE_URL}/api/files`;
export const fileDelete = () => `${BASE_URL}/api/files`;
export const fileDownload = (userId: string, fileId: string) =>
  `${BASE_URL}/api/files/download/${userId}/${fileId}`;
export const fileConfig = () => `${BASE_URL}/api/files/config`;
export const agentFiles = (agentId: string) => `${BASE_URL}/api/files/agent/${agentId}`;

export const images = () => `${files()}/images`;

export const avatar = () => `${images()}/avatar`;

export const speech = () => `${files()}/speech`;

export const speechToText = () => `${speech()}/stt`;

export const textToSpeech = () => `${speech()}/tts`;

export const textToSpeechManual = () => `${textToSpeech()}/manual`;

export const textToSpeechVoices = () => `${textToSpeech()}/voices`;

export const getCustomConfigSpeech = () => `${speech()}/config/get`;

export const getPromptGroup = (_id: string) => `${prompts()}/groups/${_id}`;

export const getPromptGroupsWithFilters = (filter: object) => {
  let url = `${prompts()}/groups`;
  // Filter out undefined/null values
  const cleanedFilter = Object.entries(filter).reduce(
    (acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  if (Object.keys(cleanedFilter).length > 0) {
    const queryParams = new URLSearchParams(cleanedFilter).toString();
    url += `?${queryParams}`;
  }
  return url;
};

export const getPromptsWithFilters = (filter: object) => {
  let url = prompts();
  if (Object.keys(filter).length > 0) {
    const queryParams = new URLSearchParams(filter as Record<string, string>).toString();
    url += `?${queryParams}`;
  }
  return url;
};

export const getPrompt = (_id: string) => `${prompts()}/${_id}`;

export const getRandomPrompts = (limit: number, skip: number) =>
  `${prompts()}/random?limit=${limit}&skip=${skip}`;

export const postPrompt = prompts;

export const updatePromptGroup = getPromptGroup;

export const updatePromptLabels = (_id: string) => `${getPrompt(_id)}/labels`;

export const updatePromptTag = (_id: string) => `${getPrompt(_id)}/tags/production`;

export const deletePromptGroup = getPromptGroup;

export const deletePrompt = ({ _id, groupId }: { _id: string; groupId: string }) => {
  return `${prompts()}/${_id}?groupId=${groupId}`;
};

export const getCategories = () => `${BASE_URL}/api/categories`;

export const getAllPromptGroups = () => `${prompts()}/all`;

/* Roles */
export const roles = () => `${BASE_URL}/api/roles`;
export const getRole = (roleName: string) => `${roles()}/${roleName.toLowerCase()}`;
export const updatePromptPermissions = (roleName: string) => `${getRole(roleName)}/prompts`;
export const updateMemoryPermissions = (roleName: string) => `${getRole(roleName)}/memories`;
export const updateAgentPermissions = (roleName: string) => `${getRole(roleName)}/agents`;
export const updatePeoplePickerPermissions = (roleName: string) =>
  `${getRole(roleName)}/people-picker`;
export const updateMCPServersPermissions = (roleName: string) => `${getRole(roleName)}/mcp-servers`;

export const updateMarketplacePermissions = (roleName: string) =>
  `${getRole(roleName)}/marketplace`;

/* Conversation Tags */
export const conversationTags = (tag?: string) =>
  `${BASE_URL}/api/tags${tag != null && tag ? `/${encodeURIComponent(tag)}` : ''}`;

export const conversationTagsList = (pageNumber: string, sort?: string, order?: string) =>
  `${conversationTags()}/list?pageNumber=${pageNumber}${sort ? `&sort=${sort}` : ''}${
    order ? `&order=${order}` : ''
  }`;

export const addTagToConversation = (conversationId: string) =>
  `${conversationTags()}/convo/${conversationId}`;

export const userTerms = () => `${BASE_URL}/api/user/terms`;
export const acceptUserTerms = () => `${BASE_URL}/api/user/terms/accept`;
export const banner = () => `${BASE_URL}/api/banner`;

// Message Feedback
export const feedback = (conversationId: string, messageId: string) =>
  `${BASE_URL}/api/messages/${conversationId}/${messageId}/feedback`;

// Two-Factor Endpoints
export const enableTwoFactor = () => `${BASE_URL}/api/auth/2fa/enable`;
export const verifyTwoFactor = () => `${BASE_URL}/api/auth/2fa/verify`;
export const confirmTwoFactor = () => `${BASE_URL}/api/auth/2fa/confirm`;
export const disableTwoFactor = () => `${BASE_URL}/api/auth/2fa/disable`;
export const regenerateBackupCodes = () => `${BASE_URL}/api/auth/2fa/backup/regenerate`;
export const verifyTwoFactorTemp = () => `${BASE_URL}/api/auth/2fa/verify-temp`;

/* Memories */
export const memories = () => `${BASE_URL}/api/memories`;
export const memory = (key: string) => `${memories()}/${encodeURIComponent(key)}`;
export const memoryPreferences = () => `${memories()}/preferences`;

export const searchPrincipals = (params: q.PrincipalSearchParams) => {
  const { q: query, limit, types } = params;
  let url = `${BASE_URL}/api/permissions/search-principals?q=${encodeURIComponent(query)}`;

  if (limit !== undefined) {
    url += `&limit=${limit}`;
  }

  if (types && types.length > 0) {
    url += `&types=${types.join(',')}`;
  }

  return url;
};

export const getAccessRoles = (resourceType: ResourceType) =>
  `${BASE_URL}/api/permissions/${resourceType}/roles`;

export const getResourcePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}`;

export const updateResourcePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}`;

export const getEffectivePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}/effective`;

export const getAllEffectivePermissions = (resourceType: ResourceType) =>
  `${BASE_URL}/api/permissions/${resourceType}/effective/all`;

// SharePoint Graph API Token
export const graphToken = (scopes: string) =>
  `${BASE_URL}/api/auth/graph-token?scopes=${encodeURIComponent(scopes)}`;

/* Analytics Endpoints */
export const analyticsConnections = () => `${BASE_URL}/api/analytics/connections`;
export const analyticsConnection = (id: string) => `${analyticsConnections()}/${id}`;
export const analyticsConnectionTest = (id: string) => `${analyticsConnection(id)}/test`;
export const analyticsTestNewConnection = () => `${analyticsConnections()}/test-new`;
export const analyticsConnectionSchema = (id: string) => `${analyticsConnection(id)}/schema`;
export const analyticsRefreshSchema = (id: string) => `${analyticsConnection(id)}/refresh-schema`;
export const analyticsTableDescriptions = (id: string) =>
  `${analyticsConnection(id)}/table-descriptions`;

/* Skills Endpoints */
export const analyticsSkills = () => `${BASE_URL}/api/analytics/skills`;
export const analyticsSkill = (id: string) => `${analyticsSkills()}/${id}`;
export const analyticsChat = () => `${BASE_URL}/api/analytics/chat`;
export const analyticsExecuteQuery = () => `${BASE_URL}/api/analytics/chat/execute`;
export const analyticsHistory = (conversationId: string) =>
  `${BASE_URL}/api/analytics/chat/history/${conversationId}`;
export const analyticsQueryByMessageId = (messageId: string) =>
  `${BASE_URL}/api/analytics/chat/query/${messageId}`;

/* Chart Endpoints */
const chartsRoot = `${BASE_URL}/api/charts`;

export const charts = (params?: {
  page?: number;
  pageSize?: number;
  folderId?: string;
  pinnedOnly?: boolean;
  search?: string;
}) => {
  if (!params) return chartsRoot;
  return `${chartsRoot}${buildQuery(params)}`;
};

export const chart = (chartId: string) => `${chartsRoot}/${chartId}`;
export const chartData = (chartId: string) => `${chartsRoot}/${chartId}/data`;
export const chartRefresh = (chartId: string) => `${chartsRoot}/${chartId}/refresh`;
export const chartDuplicate = (chartId: string) => `${chartsRoot}/${chartId}/duplicate`;

/* Subscription Endpoints */
export const subscription = () => `${BASE_URL}/api/subscription`;
export const subscriptionHistory = () => `${BASE_URL}/api/subscription/history`;
export const subscriptionPlans = () => `${BASE_URL}/api/subscription/plans`;
export const subscriptionCheckout = () => `${BASE_URL}/api/subscription/checkout`;
export const subscriptionCancel = () => `${BASE_URL}/api/subscription/cancel`;
export const subscriptionResume = () => `${BASE_URL}/api/subscription/resume`;
export const subscriptionChangePlan = () => `${BASE_URL}/api/subscription/change-plan`;
export const subscriptionUsage = () => `${BASE_URL}/api/subscription/usage`;
export const subscriptionInvoices = () => `${BASE_URL}/api/subscription/invoices`;
export const publicChart = (shareId: string) => `${chartsRoot}/public/${shareId}`;

/* Dashboard Endpoints */
const dashboardsRoot = `${BASE_URL}/api/dashboards`;

export const dashboards = (params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  starredOnly?: boolean;
  archivedOnly?: boolean;
  sortBy?: string;
  sortOrder?: string;
}) => {
  if (!params) return dashboardsRoot;
  return `${dashboardsRoot}${buildQuery(params)}`;
};

export const sharedDashboards = (params?: { page?: number; pageSize?: number }) => {
  if (!params) return `${dashboardsRoot}/shared`;
  return `${dashboardsRoot}/shared${buildQuery(params)}`;
};

export const dashboard = (dashboardId: string) => `${dashboardsRoot}/${dashboardId}`;
export const dashboardFull = (dashboardId: string) => `${dashboardsRoot}/${dashboardId}/full`;
export const dashboardLayout = (dashboardId: string) => `${dashboardsRoot}/${dashboardId}/layout`;
export const dashboardCharts = (dashboardId: string) => `${dashboardsRoot}/${dashboardId}/charts`;
export const dashboardChart = (dashboardId: string, chartId: string) =>
  `${dashboardsRoot}/${dashboardId}/charts/${chartId}`;
export const dashboardDuplicate = (dashboardId: string) =>
  `${dashboardsRoot}/${dashboardId}/duplicate`;
export const dashboardStar = (dashboardId: string) => `${dashboardsRoot}/${dashboardId}/star`;
export const publicDashboard = (shareId: string) => `${dashboardsRoot}/public/${shareId}`;

/* Admin Endpoints */
const adminRoot = `${BASE_URL}/api/admin`;
export const adminUsers = (params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) => {
  if (!params) return `${adminRoot}/users`;
  return `${adminRoot}/users${buildQuery(params)}`;
};
export const adminUser = (userId: string) => `${adminRoot}/users/${userId}`;
export const adminStats = () => `${adminRoot}/stats`;
export const adminCheck = () => `${adminRoot}/check`;

/* Saved Queries Endpoints */
const savedQueriesRoot = `${BASE_URL}/api/saved-queries`;

export const savedQueries = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: string;
}) => {
  if (!params) return savedQueriesRoot;
  return `${savedQueriesRoot}${buildQuery(params)}`;
};

export const savedQuery = (id: string) => `${savedQueriesRoot}/${id}`;
export const savedQueriesAll = () => `${savedQueriesRoot}/all`;
