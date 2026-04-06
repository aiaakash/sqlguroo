import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type {
  TDatabaseConnection,
  TCreateDatabaseConnectionRequest,
  TUpdateDatabaseConnectionRequest,
  TConnectionTestResult,
} from 'librechat-data-provider';

const ANALYTICS_CONNECTIONS_KEY = 'analytics-connections';

export function useAnalyticsConnections(organizationId: string) {
  return useQuery<TDatabaseConnection[]>({
    queryKey: [ANALYTICS_CONNECTIONS_KEY, organizationId],
    queryFn: () => dataService.getAnalyticsConnections(organizationId),
    enabled: true, // Always enabled - fetches user's connections (filtered by user on backend)
  });
}

export function useAnalyticsConnection(connectionId: string, options?: { enabled?: boolean }) {
  return useQuery<TDatabaseConnection>({
    queryKey: [ANALYTICS_CONNECTIONS_KEY, connectionId],
    queryFn: () => dataService.getAnalyticsConnection(connectionId),
    enabled: options?.enabled !== false && !!connectionId,
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TCreateDatabaseConnectionRequest) =>
      dataService.createAnalyticsConnection(data),
    onSuccess: () => {
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_CONNECTIONS_KEY] });
      // Force refetch models query to refresh dropdown (staleTime: Infinity requires refetch)
      queryClient.refetchQueries({ queryKey: [QueryKeys.models] });
    },
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TUpdateDatabaseConnectionRequest }) =>
      dataService.updateAnalyticsConnection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_CONNECTIONS_KEY] });
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dataService.deleteAnalyticsConnection(id),
    onSuccess: () => {
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_CONNECTIONS_KEY] });
      // Force refetch models query to refresh dropdown (staleTime: Infinity requires refetch)
      queryClient.refetchQueries({ queryKey: [QueryKeys.models] });
    },
  });
}

export function useTestConnection() {
  const queryClient = useQueryClient();

  return useMutation<TConnectionTestResult, Error, string>({
    mutationFn: (id: string) => dataService.testAnalyticsConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_CONNECTIONS_KEY] });
    },
  });
}

export function useTestNewConnection() {
  return useMutation<TConnectionTestResult, Error, TCreateDatabaseConnectionRequest>({
    mutationFn: (data: TCreateDatabaseConnectionRequest) =>
      dataService.testNewAnalyticsConnection(data),
  });
}

export function useAnalyticsSchema(
  connectionId: string,
  options?: { enabled?: boolean; refresh?: boolean },
) {
  return useQuery({
    queryKey: [ANALYTICS_CONNECTIONS_KEY, connectionId, 'schema'],
    queryFn: () => dataService.getAnalyticsConnectionSchema(connectionId, options?.refresh),
    enabled: options?.enabled !== false && !!connectionId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}

export function useRefreshSchema() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (connectionId: string) => dataService.refreshAnalyticsSchema(connectionId),
    onSuccess: (_, connectionId) => {
      queryClient.invalidateQueries({
        queryKey: [ANALYTICS_CONNECTIONS_KEY, connectionId, 'schema'],
      });
    },
  });
}

/* Skills Hooks */
import type { TSkill, TCreateSkillRequest, TUpdateSkillRequest } from 'librechat-data-provider';

const ANALYTICS_SKILLS_KEY = 'analytics-skills';

export function useAnalyticsSkills(isActive?: boolean) {
  return useQuery<TSkill[]>({
    queryKey: [ANALYTICS_SKILLS_KEY, isActive],
    queryFn: () => dataService.getAnalyticsSkills(isActive),
    enabled: true,
  });
}

export function useAnalyticsSkill(skillId: string, options?: { enabled?: boolean }) {
  return useQuery<TSkill>({
    queryKey: [ANALYTICS_SKILLS_KEY, skillId],
    queryFn: () => dataService.getAnalyticsSkill(skillId),
    enabled: options?.enabled !== false && !!skillId,
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TCreateSkillRequest) => dataService.createAnalyticsSkill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_SKILLS_KEY] });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TUpdateSkillRequest }) =>
      dataService.updateAnalyticsSkill(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_SKILLS_KEY] });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dataService.deleteAnalyticsSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ANALYTICS_SKILLS_KEY] });
    },
  });
}

/* Query Execution Hooks */
import type {
  TExecuteQueryRequest,
  TExecuteQueryResponse,
  TAnalyticsQuery,
} from 'librechat-data-provider';

const ANALYTICS_QUERY_HISTORY_KEY = 'analytics-query-history';

export function useExecuteQuery() {
  const queryClient = useQueryClient();

  return useMutation<TExecuteQueryResponse, Error, TExecuteQueryRequest>({
    mutationFn: (data: TExecuteQueryRequest) => dataService.executeAnalyticsQuery(data),
    onSuccess: (_, variables) => {
      // Invalidate query history cache if conversationId is provided
      if (variables.conversationId) {
        queryClient.invalidateQueries({
          queryKey: [ANALYTICS_QUERY_HISTORY_KEY, variables.conversationId],
        });
      }
    },
  });
}

export function useQueryHistory(
  conversationId: string,
  options?: { enabled?: boolean; limit?: number },
) {
  return useQuery<TAnalyticsQuery[]>({
    queryKey: [ANALYTICS_QUERY_HISTORY_KEY, conversationId, options?.limit],
    queryFn: () => dataService.getAnalyticsHistory(conversationId, options?.limit),
    enabled: options?.enabled !== false && !!conversationId,
  });
}

const TABLE_DESCRIPTIONS_KEY = 'analytics-table-descriptions';

export function useTableDescriptions(connectionId: string, options?: { enabled?: boolean }) {
  return useQuery<{
    tableDescriptions: Record<string, string>;
    columnDescriptions: Record<string, string>;
  }>({
    queryKey: [TABLE_DESCRIPTIONS_KEY, connectionId],
    queryFn: () => dataService.getTableDescriptions(connectionId),
    enabled: options?.enabled !== false && !!connectionId,
  });
}

export function useSaveTableDescriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      connectionId,
      tableDescriptions,
      columnDescriptions,
    }: {
      connectionId: string;
      tableDescriptions?: Record<string, string>;
      columnDescriptions?: Record<string, string>;
    }) =>
      dataService.saveTableDescriptions(connectionId, { tableDescriptions, columnDescriptions }),
    onSuccess: (_, { connectionId }) => {
      // Invalidate both the descriptions query AND the schema query
      // because descriptions are stored in the cachedSchema
      queryClient.invalidateQueries({ queryKey: [TABLE_DESCRIPTIONS_KEY, connectionId] });
      queryClient.invalidateQueries({
        queryKey: [ANALYTICS_CONNECTIONS_KEY, connectionId, 'schema'],
      });
    },
  });
}
