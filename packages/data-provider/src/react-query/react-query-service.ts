import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import { Constants, initialModelsConfig } from '../config';
import { defaultOrderQuery } from '../types/assistants';
import { MCPServerConnectionStatusResponse } from '../types/queries';
import * as dataService from '../data-service';
import * as m from '../types/mutations';
import * as q from '../types/queries';
import { QueryKeys } from '../keys';
import * as s from '../schemas';
import * as t from '../types';
import * as permissions from '../accessPermissions';
import { ResourceType } from '../accessPermissions';
import * as analytics from '../types/analytics';

export { hasPermissions } from '../accessPermissions';

export const useGetSharedMessages = (
  shareId: string,
  config?: UseQueryOptions<t.TSharedMessagesResponse>,
): QueryObserverResult<t.TSharedMessagesResponse> => {
  return useQuery<t.TSharedMessagesResponse>(
    [QueryKeys.sharedMessages, shareId],
    () => dataService.getSharedMessages(shareId),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetSharedLinkQuery = (
  conversationId: string,
  config?: UseQueryOptions<t.TSharedLinkGetResponse>,
): QueryObserverResult<t.TSharedLinkGetResponse> => {
  const queryClient = useQueryClient();
  return useQuery<t.TSharedLinkGetResponse>(
    [QueryKeys.sharedLinks, conversationId],
    () => dataService.getSharedLink(conversationId),
    {
      enabled:
        !!conversationId &&
        conversationId !== Constants.NEW_CONVO &&
        conversationId !== Constants.PENDING_CONVO,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      onSuccess: (data) => {
        queryClient.setQueryData([QueryKeys.sharedLinks, conversationId], {
          conversationId: data.conversationId,
          shareId: data.shareId,
        });
      },
      ...config,
    },
  );
};

export const useGetConversationByIdQuery = (
  id: string,
  config?: UseQueryOptions<s.TConversation>,
): QueryObserverResult<s.TConversation> => {
  return useQuery<s.TConversation>(
    [QueryKeys.conversation, id],
    () => dataService.getConversationById(id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

//This isn't ideal because its just a query and we're using mutation, but it was the only way
//to make it work with how the Chat component is structured
export const useGetConversationByIdMutation = (id: string): UseMutationResult<s.TConversation> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.getConversationById(id), {
    // onSuccess: (res: s.TConversation) => {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.conversation, id]);
    },
  });
};

export const useUpdateMessageMutation = (
  id: string,
): UseMutationResult<unknown, unknown, t.TUpdateMessageRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TUpdateMessageRequest) => dataService.updateMessage(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.messages, id]);
    },
  });
};

export const useUpdateMessageContentMutation = (
  conversationId: string,
): UseMutationResult<unknown, unknown, t.TUpdateMessageContent, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateMessageContent) => dataService.updateMessageContent(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
      },
    },
  );
};

export const useUpdateUserKeysMutation = (): UseMutationResult<
  t.TUser,
  unknown,
  t.TUpdateUserKeyRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TUpdateUserKeyRequest) => dataService.updateUserKey(payload), {
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries([QueryKeys.name, variables.name]);
    },
  });
};

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.clearAllConversations(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useRevokeUserKeyMutation = (name: string): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.revokeUserKey(name), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.name, name]);
      if (s.isAssistantsEndpoint(name)) {
        queryClient.invalidateQueries([QueryKeys.assistants, name, defaultOrderQuery]);
        queryClient.invalidateQueries([QueryKeys.assistantDocs]);
        queryClient.invalidateQueries([QueryKeys.assistants]);
        queryClient.invalidateQueries([QueryKeys.assistant]);
        queryClient.invalidateQueries([QueryKeys.mcpTools]);
        queryClient.invalidateQueries([QueryKeys.actions]);
        queryClient.invalidateQueries([QueryKeys.tools]);
      }
    },
  });
};

export const useRevokeAllUserKeysMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.revokeAllUserKeys(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.name]);
      queryClient.invalidateQueries([
        QueryKeys.assistants,
        s.EModelEndpoint.assistants,
        defaultOrderQuery,
      ]);
      queryClient.invalidateQueries([
        QueryKeys.assistants,
        s.EModelEndpoint.azureAssistants,
        defaultOrderQuery,
      ]);
      queryClient.invalidateQueries([QueryKeys.assistantDocs]);
      queryClient.invalidateQueries([QueryKeys.assistants]);
      queryClient.invalidateQueries([QueryKeys.assistant]);
      queryClient.invalidateQueries([QueryKeys.mcpTools]);
      queryClient.invalidateQueries([QueryKeys.actions]);
      queryClient.invalidateQueries([QueryKeys.tools]);
    },
  });
};

export const useGetModelsQuery = (
  config?: UseQueryOptions<t.TModelsConfig>,
): QueryObserverResult<t.TModelsConfig> => {
  return useQuery<t.TModelsConfig>([QueryKeys.models], () => dataService.getModels(), {
    initialData: initialModelsConfig,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
    ...config,
  });
};

export const useCreatePresetMutation = (): UseMutationResult<
  s.TPreset,
  unknown,
  s.TPreset,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: s.TPreset) => dataService.createPreset(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.presets]);
    },
  });
};

export const useDeletePresetMutation = (): UseMutationResult<
  m.PresetDeleteResponse,
  unknown,
  s.TPreset | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: s.TPreset | undefined) => dataService.deletePreset(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.presets]);
    },
  });
};

export const useUpdateTokenCountMutation = (): UseMutationResult<
  t.TUpdateTokenCountResponse,
  unknown,
  { text: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(({ text }: { text: string }) => dataService.updateTokenCount(text), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.tokenCount]);
    },
  });
};

export const useRegisterUserMutation = (
  options?: m.RegistrationOptions,
): UseMutationResult<t.TError, unknown, t.TRegisterUser, unknown> => {
  const queryClient = useQueryClient();
  return useMutation<t.TRegisterUserResponse, t.TError, t.TRegisterUser>(
    (payload: t.TRegisterUser) => dataService.register(payload),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([QueryKeys.user]);
        if (options?.onSuccess) {
          options.onSuccess(...args);
        }
      },
    },
  );
};

export const useUserKeyQuery = (
  name: string,
  config?: UseQueryOptions<t.TCheckUserKeyResponse>,
): QueryObserverResult<t.TCheckUserKeyResponse> => {
  return useQuery<t.TCheckUserKeyResponse>(
    [QueryKeys.name, name],
    () => {
      if (!name) {
        return Promise.resolve({ expiresAt: '' });
      }
      return dataService.userKeyQuery(name);
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

export const useRequestPasswordResetMutation = (): UseMutationResult<
  t.TRequestPasswordResetResponse,
  unknown,
  t.TRequestPasswordReset,
  unknown
> => {
  return useMutation((payload: t.TRequestPasswordReset) =>
    dataService.requestPasswordReset(payload),
  );
};

export const useResetPasswordMutation = (): UseMutationResult<
  unknown,
  unknown,
  t.TResetPassword,
  unknown
> => {
  return useMutation((payload: t.TResetPassword) => dataService.resetPassword(payload));
};

export const useAvailablePluginsQuery = <TData = s.TPlugin[]>(
  config?: UseQueryOptions<s.TPlugin[], unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<s.TPlugin[], unknown, TData>(
    [QueryKeys.availablePlugins],
    () => dataService.getAvailablePlugins(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUpdateUserPluginsMutation = (
  _options?: m.UpdatePluginAuthOptions,
): UseMutationResult<t.TUser, unknown, t.TUpdateUserPlugins, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options ?? {};
  return useMutation((payload: t.TUpdateUserPlugins) => dataService.updateUserPlugins(payload), {
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.user]);
      onSuccess?.(...args);
      if (args[1]?.action === 'uninstall' && args[1]?.pluginKey?.startsWith(Constants.mcp_prefix)) {
        const serverName = args[1]?.pluginKey?.substring(Constants.mcp_prefix.length);
        queryClient.invalidateQueries([QueryKeys.mcpAuthValues, serverName]);
      }
    },
  });
};

export const useReinitializeMCPServerMutation = (): UseMutationResult<
  {
    success: boolean;
    message: string;
    serverName: string;
    oauthRequired?: boolean;
    oauthUrl?: string;
  },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((serverName: string) => dataService.reinitializeMCPServer(serverName), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.mcpTools]);
    },
  });
};

export const useCancelMCPOAuthMutation = (): UseMutationResult<
  m.CancelMCPOAuthResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((serverName: string) => dataService.cancelMCPOAuth(serverName), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);
    },
  });
};

export const useGetCustomConfigSpeechQuery = (
  config?: UseQueryOptions<t.TCustomConfigSpeechResponse>,
): QueryObserverResult<t.TCustomConfigSpeechResponse> => {
  return useQuery<t.TCustomConfigSpeechResponse>(
    [QueryKeys.customConfigSpeech],
    () => dataService.getCustomConfigSpeech(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUpdateFeedbackMutation = (
  conversationId: string,
  messageId: string,
): UseMutationResult<t.TUpdateFeedbackResponse, Error, t.TUpdateFeedbackRequest> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateFeedbackRequest) =>
      dataService.updateFeedback(conversationId, messageId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.messages, messageId]);
      },
    },
  );
};

export const useSearchPrincipalsQuery = (
  params: q.PrincipalSearchParams,
  config?: UseQueryOptions<q.PrincipalSearchResponse>,
): QueryObserverResult<q.PrincipalSearchResponse> => {
  return useQuery<q.PrincipalSearchResponse>(
    [QueryKeys.principalSearch, params],
    () => dataService.searchPrincipals(params),
    {
      enabled: !!params.q && params.q.length >= 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetAccessRolesQuery = (
  resourceType: ResourceType,
  config?: UseQueryOptions<q.AccessRolesResponse>,
): QueryObserverResult<q.AccessRolesResponse> => {
  return useQuery<q.AccessRolesResponse>(
    [QueryKeys.accessRoles, resourceType],
    () => dataService.getAccessRoles(resourceType),
    {
      enabled: !!resourceType,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      ...config,
    },
  );
};

export const useGetResourcePermissionsQuery = (
  resourceType: ResourceType,
  resourceId: string,
  config?: UseQueryOptions<permissions.TGetResourcePermissionsResponse>,
): QueryObserverResult<permissions.TGetResourcePermissionsResponse> => {
  return useQuery<permissions.TGetResourcePermissionsResponse>(
    [QueryKeys.resourcePermissions, resourceType, resourceId],
    () => dataService.getResourcePermissions(resourceType, resourceId),
    {
      enabled: !!resourceType && !!resourceId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 2 * 60 * 1000, // Cache for 2 minutes
      ...config,
    },
  );
};

export const useUpdateResourcePermissionsMutation = (): UseMutationResult<
  permissions.TUpdateResourcePermissionsResponse,
  Error,
  {
    resourceType: ResourceType;
    resourceId: string;
    data: permissions.TUpdateResourcePermissionsRequest;
  }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resourceType, resourceId, data }) =>
      dataService.updateResourcePermissions(resourceType, resourceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.accessRoles, variables.resourceType],
      });

      queryClient.invalidateQueries({
        queryKey: [QueryKeys.resourcePermissions, variables.resourceType, variables.resourceId],
      });

      queryClient.invalidateQueries({
        queryKey: [QueryKeys.effectivePermissions, variables.resourceType, variables.resourceId],
      });
    },
  });
};

export const useGetEffectivePermissionsQuery = (
  resourceType: ResourceType,
  resourceId: string,
  config?: UseQueryOptions<permissions.TEffectivePermissionsResponse>,
): QueryObserverResult<permissions.TEffectivePermissionsResponse> => {
  return useQuery<permissions.TEffectivePermissionsResponse>({
    queryKey: [QueryKeys.effectivePermissions, resourceType, resourceId],
    queryFn: () => dataService.getEffectivePermissions(resourceType, resourceId),
    enabled: !!resourceType && !!resourceId,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    ...config,
  });
};

export const useGetAllEffectivePermissionsQuery = (
  resourceType: ResourceType,
  config?: UseQueryOptions<permissions.TAllEffectivePermissionsResponse>,
): QueryObserverResult<permissions.TAllEffectivePermissionsResponse> => {
  return useQuery<permissions.TAllEffectivePermissionsResponse>({
    queryKey: [QueryKeys.effectivePermissions, 'all', resourceType],
    queryFn: () => dataService.getAllEffectivePermissions(resourceType),
    enabled: !!resourceType,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    ...config,
  });
};

export const useMCPServerConnectionStatusQuery = (
  serverName: string,
  config?: UseQueryOptions<MCPServerConnectionStatusResponse>,
): QueryObserverResult<MCPServerConnectionStatusResponse> => {
  return useQuery<MCPServerConnectionStatusResponse>(
    [QueryKeys.mcpConnectionStatus, serverName],
    () => dataService.getMCPServerConnectionStatus(serverName),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 10000, // 10 seconds
      enabled: !!serverName,
      ...config,
    },
  );
};

/* Charts Hooks */
import type * as charts from '../types/charts';

export const useGetChartsQuery = (
  params?: charts.GetChartsParams,
  config?: UseQueryOptions<charts.ChartsListResponse>,
): QueryObserverResult<charts.ChartsListResponse> => {
  return useQuery<charts.ChartsListResponse>(
    [QueryKeys.charts, params],
    () => dataService.getCharts(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000, // 30 seconds
      ...config,
    },
  );
};

export const useGetChartQuery = (
  chartId: string,
  config?: UseQueryOptions<charts.TChart>,
): QueryObserverResult<charts.TChart> => {
  return useQuery<charts.TChart>([QueryKeys.chart, chartId], () => dataService.getChart(chartId), {
    enabled: !!chartId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60000, // 1 minute
    ...config,
  });
};

export const useGetChartWithDataQuery = (
  chartId: string,
  config?: UseQueryOptions<charts.ChartWithDataResponse>,
): QueryObserverResult<charts.ChartWithDataResponse> => {
  return useQuery<charts.ChartWithDataResponse>(
    [QueryKeys.chartData, chartId],
    () => dataService.getChartWithData(chartId),
    {
      enabled: !!chartId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000, // 30 seconds
      ...config,
    },
  );
};

export const useGetPublicChartQuery = (
  shareId: string,
  config?: UseQueryOptions<charts.TChart>,
): QueryObserverResult<charts.TChart> => {
  return useQuery<charts.TChart>(
    [QueryKeys.chart, 'public', shareId],
    () => dataService.getPublicChart(shareId),
    {
      enabled: !!shareId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000, // 1 minute
      ...config,
    },
  );
};

export const useCreateChartMutation = (): UseMutationResult<
  charts.TChart,
  unknown,
  charts.CreateChartRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: charts.CreateChartRequest) => dataService.createChart(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.charts]);
    },
  });
};

export const useUpdateChartMutation = (): UseMutationResult<
  charts.TChart,
  unknown,
  { chartId: string; data: charts.UpdateChartRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ chartId, data }: { chartId: string; data: charts.UpdateChartRequest }) =>
      dataService.updateChart(chartId, data),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.charts]);
        queryClient.invalidateQueries([QueryKeys.chart, variables.chartId]);
        queryClient.invalidateQueries([QueryKeys.chartData, variables.chartId]);
      },
    },
  );
};

export const useUpdateChartDataMutation = (): UseMutationResult<
  charts.TChart,
  unknown,
  { chartId: string; dataSnapshot: charts.TChartDataSnapshot },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ chartId, dataSnapshot }: { chartId: string; dataSnapshot: charts.TChartDataSnapshot }) =>
      dataService.updateChartData(chartId, dataSnapshot),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.charts]);
        queryClient.invalidateQueries([QueryKeys.chart, variables.chartId]);
        queryClient.invalidateQueries([QueryKeys.chartData, variables.chartId]);
      },
    },
  );
};

export const useDuplicateChartMutation = (): UseMutationResult<
  charts.TChart,
  unknown,
  { chartId: string; name?: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ chartId, name }: { chartId: string; name?: string }) =>
      dataService.duplicateChart(chartId, name),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.charts]);
      },
    },
  );
};

export const useDeleteChartMutation = (): UseMutationResult<
  { success: boolean },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((chartId: string) => dataService.deleteChart(chartId), {
    onSuccess: (_, chartId) => {
      queryClient.invalidateQueries([QueryKeys.charts]);
      queryClient.invalidateQueries([QueryKeys.chart, chartId]);
      queryClient.invalidateQueries([QueryKeys.chartData, chartId]);
    },
  });
};

export const useRefreshChartDataMutation = (): UseMutationResult<
  charts.ChartWithDataResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((chartId: string) => dataService.refreshChartData(chartId), {
    onSuccess: (data, chartId) => {
      queryClient.invalidateQueries([QueryKeys.charts]);
      queryClient.invalidateQueries([QueryKeys.chart, chartId]);
      queryClient.invalidateQueries([QueryKeys.chartData, chartId]);
    },
  });
};

export const useGetAnalyticsQueryByMessageIdQuery = (
  messageId: string,
  config?: UseQueryOptions<analytics.TAnalyticsQueryRef>,
): QueryObserverResult<analytics.TAnalyticsQueryRef> => {
  return useQuery<analytics.TAnalyticsQueryRef>(
    ['analyticsQuery', messageId],
    () => dataService.getAnalyticsQueryByMessageId(messageId),
    {
      enabled: !!messageId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000,
      ...config,
    },
  );
};

/* Dashboard Hooks */
import type * as dashboards from '../types/dashboards';

export const useGetDashboardsQuery = (
  params?: dashboards.GetDashboardsParams,
  config?: UseQueryOptions<dashboards.DashboardsListResponse>,
): QueryObserverResult<dashboards.DashboardsListResponse> => {
  return useQuery<dashboards.DashboardsListResponse>(
    [QueryKeys.dashboards, params],
    () => dataService.getDashboards(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetSharedDashboardsQuery = (
  params?: { page?: number; pageSize?: number },
  config?: UseQueryOptions<dashboards.DashboardsListResponse>,
): QueryObserverResult<dashboards.DashboardsListResponse> => {
  return useQuery<dashboards.DashboardsListResponse>(
    [QueryKeys.sharedDashboards, params],
    () => dataService.getSharedDashboards(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetDashboardQuery = (
  dashboardId: string,
  config?: UseQueryOptions<dashboards.TDashboard>,
): QueryObserverResult<dashboards.TDashboard> => {
  return useQuery<dashboards.TDashboard>(
    [QueryKeys.dashboard, dashboardId],
    () => dataService.getDashboard(dashboardId),
    {
      enabled: !!dashboardId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000,
      ...config,
    },
  );
};

export const useGetDashboardWithChartsQuery = (
  dashboardId: string,
  config?: UseQueryOptions<dashboards.DashboardWithChartsResponse>,
): QueryObserverResult<dashboards.DashboardWithChartsResponse> => {
  return useQuery<dashboards.DashboardWithChartsResponse>(
    [QueryKeys.dashboardFull, dashboardId],
    () => dataService.getDashboardWithCharts(dashboardId),
    {
      enabled: !!dashboardId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetPublicDashboardQuery = (
  shareId: string,
  config?: UseQueryOptions<dashboards.DashboardWithChartsResponse>,
): QueryObserverResult<dashboards.DashboardWithChartsResponse> => {
  return useQuery<dashboards.DashboardWithChartsResponse>(
    [QueryKeys.publicDashboard, shareId],
    () => dataService.getPublicDashboard(shareId),
    {
      enabled: !!shareId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000,
      ...config,
    },
  );
};

export const useCreateDashboardMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  dashboards.CreateDashboardRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: dashboards.CreateDashboardRequest) => dataService.createDashboard(payload),
    {
      onSuccess: () => {
        // Only invalidate dashboards list, not individual dashboard queries
        queryClient.invalidateQueries([QueryKeys.dashboards]);
      },
    },
  );
};

export const useUpdateDashboardMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  { dashboardId: string; data: dashboards.UpdateDashboardRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ dashboardId, data }: { dashboardId: string; data: dashboards.UpdateDashboardRequest }) =>
      dataService.updateDashboard(dashboardId, data),
    {
      onSuccess: (data, variables) => {
        // Update cache directly instead of invalidating to prevent loading states
        queryClient.setQueryData([QueryKeys.dashboard, variables.dashboardId], data);
        queryClient.setQueryData([QueryKeys.dashboardFull, variables.dashboardId], (old: any) => ({
          ...old,
          ...data,
        }));
        // Only invalidate list if name/description changed
        if (variables.data.name || variables.data.description) {
          queryClient.invalidateQueries([QueryKeys.dashboards]);
        }
      },
    },
  );
};

export const useUpdateDashboardLayoutMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  { dashboardId: string; charts: dashboards.IDashboardChartItem[] },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ dashboardId, charts }: { dashboardId: string; charts: dashboards.IDashboardChartItem[] }) =>
      dataService.updateDashboardLayout(dashboardId, charts),
    {
      onSuccess: (data, variables) => {
        // Update cache directly for immediate UI feedback
        queryClient.setQueryData([QueryKeys.dashboard, variables.dashboardId], data);
        queryClient.setQueryData([QueryKeys.dashboardFull, variables.dashboardId], (old: any) => ({
          ...old,
          charts: variables.charts,
        }));
        // Don't invalidate dashboards list as layout changes don't affect it
      },
    },
  );
};

export const useAddChartToDashboardMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  { dashboardId: string; chartItem: dashboards.AddChartToDashboardRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({
      dashboardId,
      chartItem,
    }: {
      dashboardId: string;
      chartItem: dashboards.AddChartToDashboardRequest;
    }) => dataService.addChartToDashboard(dashboardId, chartItem),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.dashboards]);
        queryClient.invalidateQueries([QueryKeys.dashboard, variables.dashboardId]);
        queryClient.invalidateQueries([QueryKeys.dashboardFull, variables.dashboardId]);
      },
    },
  );
};

export const useRemoveChartFromDashboardMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  { dashboardId: string; chartId: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ dashboardId, chartId }: { dashboardId: string; chartId: string }) =>
      dataService.removeChartFromDashboard(dashboardId, chartId),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.dashboards]);
        queryClient.invalidateQueries([QueryKeys.dashboard, variables.dashboardId]);
        queryClient.invalidateQueries([QueryKeys.dashboardFull, variables.dashboardId]);
      },
    },
  );
};

export const useDuplicateDashboardMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  { dashboardId: string; name?: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ dashboardId, name }: { dashboardId: string; name?: string }) =>
      dataService.duplicateDashboard(dashboardId, name),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.dashboards]);
      },
    },
  );
};

export const useToggleDashboardStarMutation = (): UseMutationResult<
  dashboards.TDashboard,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((dashboardId: string) => dataService.toggleDashboardStar(dashboardId), {
    onSuccess: (_, dashboardId) => {
      queryClient.invalidateQueries([QueryKeys.dashboards]);
      queryClient.invalidateQueries([QueryKeys.dashboard, dashboardId]);
    },
  });
};

export const useDeleteDashboardMutation = (): UseMutationResult<
  { success: boolean },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((dashboardId: string) => dataService.deleteDashboard(dashboardId), {
    onSuccess: (_, dashboardId) => {
      queryClient.invalidateQueries([QueryKeys.dashboards]);
      queryClient.invalidateQueries([QueryKeys.dashboard, dashboardId]);
      queryClient.invalidateQueries([QueryKeys.dashboardFull, dashboardId]);
    },
  });
};

/* Admin Hooks */
import type * as admin from '../types/admin';

export const useGetAdminUsersQuery = (
  params?: admin.TAdminUsersParams,
  config?: UseQueryOptions<admin.TAdminUsersResponse>,
): QueryObserverResult<admin.TAdminUsersResponse> => {
  return useQuery<admin.TAdminUsersResponse>(
    ['adminUsers', params],
    () => dataService.getAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetAdminUserQuery = (
  userId: string,
  config?: UseQueryOptions<admin.TAdminUserDetail>,
): QueryObserverResult<admin.TAdminUserDetail> => {
  return useQuery<admin.TAdminUserDetail>(
    ['adminUser', userId],
    () => dataService.getAdminUser(userId),
    {
      enabled: !!userId,
      refetchOnWindowFocus: false,
      staleTime: 60000,
      ...config,
    },
  );
};

export const useGetAdminStatsQuery = (
  config?: UseQueryOptions<admin.TAdminStats>,
): QueryObserverResult<admin.TAdminStats> => {
  return useQuery<admin.TAdminStats>(['adminStats'], () => dataService.getAdminStats(), {
    refetchOnWindowFocus: false,
    staleTime: 60000,
    ...config,
  });
};

export const useCheckAdminAccessQuery = (
  config?: UseQueryOptions<admin.TAdminCheckResponse>,
): QueryObserverResult<admin.TAdminCheckResponse> => {
  return useQuery<admin.TAdminCheckResponse>(['adminCheck'], () => dataService.checkAdminAccess(), {
    refetchOnWindowFocus: false,
    staleTime: 300000, // 5 minutes
    retry: false,
    ...config,
  });
};

/* Saved Queries Hooks */

export const useGetSavedQueriesQuery = (
  params?: analytics.TListSavedQueriesParams,
  config?: UseQueryOptions<analytics.TListSavedQueriesResponse>,
): QueryObserverResult<analytics.TListSavedQueriesResponse> => {
  return useQuery<analytics.TListSavedQueriesResponse>(
    [QueryKeys.savedQueries, params],
    () => dataService.getSavedQueries(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30000,
      ...config,
    },
  );
};

export const useGetAllSavedQueriesQuery = (
  config?: UseQueryOptions<analytics.TSavedQuery[]>,
): QueryObserverResult<analytics.TSavedQuery[]> => {
  return useQuery<analytics.TSavedQuery[]>(
    [QueryKeys.savedQueries, 'all'],
    () => dataService.getAllSavedQueries(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000,
      ...config,
    },
  );
};

export const useGetSavedQueryQuery = (
  id: string,
  config?: UseQueryOptions<analytics.TSavedQuery>,
): QueryObserverResult<analytics.TSavedQuery> => {
  return useQuery<analytics.TSavedQuery>(
    [QueryKeys.savedQuery, id],
    () => dataService.getSavedQuery(id),
    {
      enabled: !!id,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60000,
      ...config,
    },
  );
};

export const useCreateSavedQueryMutation = (): UseMutationResult<
  analytics.TSavedQuery,
  unknown,
  analytics.TCreateSavedQueryRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: analytics.TCreateSavedQueryRequest) => dataService.createSavedQuery(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.savedQueries]);
      },
    },
  );
};

export const useUpdateSavedQueryMutation = (): UseMutationResult<
  analytics.TSavedQuery,
  unknown,
  { id: string; data: analytics.TUpdateSavedQueryRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ id, data }: { id: string; data: analytics.TUpdateSavedQueryRequest }) =>
      dataService.updateSavedQuery(id, data),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.savedQueries]);
        queryClient.invalidateQueries([QueryKeys.savedQuery, variables.id]);
      },
    },
  );
};

export const useDeleteSavedQueryMutation = (): UseMutationResult<
  { message: string },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.deleteSavedQuery(id), {
    onSuccess: (_, id) => {
      queryClient.invalidateQueries([QueryKeys.savedQueries]);
      queryClient.invalidateQueries([QueryKeys.savedQuery, id]);
    },
  });
};
