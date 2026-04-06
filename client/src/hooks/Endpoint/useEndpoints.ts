import React, { useMemo, useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Permissions,
  alternateName,
  EModelEndpoint,
  PermissionTypes,
  getEndpointField,
} from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TAssistantsMap,
  TStartupConfig,
  Assistant,
  Agent,
} from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { useGetEndpointsQuery } from '~/data-provider';
import { mapEndpoints, getIconKey } from '~/utils';
import { useHasAccess } from '~/hooks';
import { icons } from './Icons';

export const useEndpoints = ({
  agents,
  assistantsMap,
  endpointsConfig,
  startupConfig,
  analyticsConnections = [],
}: {
  agents?: Agent[] | null;
  assistantsMap?: TAssistantsMap;
  endpointsConfig: TEndpointsConfig;
  startupConfig: TStartupConfig | undefined;
  analyticsConnections?: Array<{ _id: string; name: string; type: string }>;
}) => {
  const modelsQuery = useGetModelsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  const interfaceConfig = startupConfig?.interface ?? {};
  const includedEndpoints = useMemo(
    () => new Set(startupConfig?.modelSpecs?.addedEndpoints ?? []),
    [startupConfig?.modelSpecs?.addedEndpoints],
  );

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const assistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.assistants] ?? {}),
    [assistantsMap],
  );

  const azureAssistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.azureAssistants] ?? {}),
    [assistantsMap],
  );

  // Endpoints to exclude from the model selector
  // To re-enable OpenAI, OpenRouter, or Agents, simply remove them from these arrays
  const EXCLUDED_ENDPOINTS = [
    EModelEndpoint.openAI,
    EModelEndpoint.agents,
  ] as const;
  
  // Endpoints to exclude by name (case-insensitive) - for custom endpoints
  // To re-enable OpenRouter, remove 'openrouter' from this array
  const EXCLUDED_ENDPOINT_NAMES = ['openrouter', 'groq', 'mistral', 'helicon', 'helicone', 'portkey'] as const;

  const filteredEndpoints = useMemo(() => {
    if (!interfaceConfig.modelSelect) {
      return [];
    }
    const result: EModelEndpoint[] = [];
    
    for (let i = 0; i < endpoints.length; i++) {
      // Exclude analytics endpoint (replaced by closeAI)
      if (endpoints[i] === EModelEndpoint.analytics) {
        continue;
      }
      
      // Exclude specific endpoints (OpenAI, OpenRouter, etc.)
      if (EXCLUDED_ENDPOINTS.includes(endpoints[i] as any)) {
        continue;
      }
      
      // Exclude endpoints by name (case-insensitive) - for custom endpoints
      const endpointLower = (endpoints[i] as string)?.toLowerCase();
      if (EXCLUDED_ENDPOINT_NAMES.includes(endpointLower as any)) {
        continue;
      }
      
      if (endpoints[i] === EModelEndpoint.agents && !hasAgentAccess) {
        continue;
      }
      if (includedEndpoints.size > 0 && !includedEndpoints.has(endpoints[i])) {
        continue;
      }
      result.push(endpoints[i]);
    }

    return result;
  }, [endpoints, hasAgentAccess, includedEndpoints, interfaceConfig.modelSelect]);

  const endpointRequiresUserKey = useCallback(
    (ep: string) => {
      return !!getEndpointField(endpointsConfig, ep, 'userProvide');
    },
    [endpointsConfig],
  );

  const mappedEndpoints: Endpoint[] = useMemo(() => {
    return filteredEndpoints.map((ep) => {
      const endpointType = getEndpointField(endpointsConfig, ep, 'type');
      const iconKey = getIconKey({ endpoint: ep, endpointsConfig, endpointType });
      const Icon = icons[iconKey];
      const endpointIconURL = getEndpointField(endpointsConfig, ep, 'iconURL');
      const hasModels =
        (ep === EModelEndpoint.agents && (agents?.length ?? 0) > 0) ||
        (ep === EModelEndpoint.assistants && assistants?.length > 0) ||
        (ep !== EModelEndpoint.assistants &&
          ep !== EModelEndpoint.agents &&
          ep !== EModelEndpoint.analytics &&
          (modelsQuery.data?.[ep]?.length ?? 0) > 0);

      // Base result object with formatted default icon
      const result: Endpoint = {
        value: ep,
        label: alternateName[ep] || ep,
        hasModels,
        icon: Icon
          ? React.createElement(Icon, {
              size: 20,
              className: 'text-text-primary shrink-0 icon-md',
              iconURL: endpointIconURL,
              endpoint: ep,
            })
          : null,
      };

      // Handle agents case
      if (ep === EModelEndpoint.agents && (agents?.length ?? 0) > 0) {
        result.models = agents?.map((agent) => ({
          name: agent.id,
          isGlobal: agent.isPublic ?? false,
        }));
        result.agentNames = agents?.reduce((acc, agent) => {
          acc[agent.id] = agent.name || '';
          return acc;
        }, {});
        result.modelIcons = agents?.reduce((acc, agent) => {
          acc[agent.id] = agent?.avatar?.filepath;
          return acc;
        }, {});
      }

      // Handle assistants case
      else if (ep === EModelEndpoint.assistants && assistants.length > 0) {
        result.models = assistants.map((assistant: { id: string }) => ({
          name: assistant.id,
          isGlobal: false,
        }));
        result.assistantNames = assistants.reduce(
          (acc: Record<string, string>, assistant: Assistant) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          },
          {},
        );
        result.modelIcons = assistants.reduce(
          (acc: Record<string, string | undefined>, assistant: Assistant) => {
            acc[assistant.id] = assistant.metadata?.avatar;
            return acc;
          },
          {},
        );
      } else if (ep === EModelEndpoint.azureAssistants && azureAssistants.length > 0) {
        result.models = azureAssistants.map((assistant: { id: string }) => ({
          name: assistant.id,
          isGlobal: false,
        }));
        result.assistantNames = azureAssistants.reduce(
          (acc: Record<string, string>, assistant: Assistant) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          },
          {},
        );
        result.modelIcons = azureAssistants.reduce(
          (acc: Record<string, string | undefined>, assistant: Assistant) => {
            acc[assistant.id] = assistant.metadata?.avatar;
            return acc;
          },
          {},
        );
      }

      // Handle closeAI case - includes both gpt-5.2 and analytics connections
      else if (ep === EModelEndpoint.closeAI && (modelsQuery.data?.[ep]?.length ?? 0) > 0) {
        result.models = modelsQuery.data?.[ep]?.map((model) => ({
          name: model,
          isGlobal: false,
        }));
        // Map connection IDs to their actual connection names and types
        // Build maps from analyticsConnections
        const connectionNamesMap: Record<string, string> = {};
        const connectionTypesMap: Record<string, string> = {};
        if (analyticsConnections.length > 0) {
          analyticsConnections.forEach((conn) => {
            if (conn._id && conn.name) {
              connectionNamesMap[conn._id] = conn.name;
            }
            if (conn._id && conn.type) {
              connectionTypesMap[conn._id] = conn.type;
            }
          });
        }
        // For any model IDs that are connection IDs (24-char hex strings) but don't have a name,
        // we'll need to fetch them. For now, ensure all connection IDs in models have names.
        // If a connection ID doesn't have a name in our map, it means it's from a different org
        // or not loaded yet. We'll still try to use it, but fallback to showing the ID.
        result.connectionNames = connectionNamesMap;
        result.connectionTypes = connectionTypesMap;
      }
      // For other endpoints with models from the modelsQuery
      else if (
        ep !== EModelEndpoint.agents &&
        ep !== EModelEndpoint.assistants &&
        ep !== EModelEndpoint.closeAI &&
        (modelsQuery.data?.[ep]?.length ?? 0) > 0
      ) {
        result.models = modelsQuery.data?.[ep]?.map((model) => ({
          name: model,
          isGlobal: false,
        }));
      }

      return result;
    });
  }, [filteredEndpoints, endpointsConfig, modelsQuery.data, agents, assistants, azureAssistants, analyticsConnections]);

  return {
    mappedEndpoints,
    endpointRequiresUserKey,
  };
};

export default useEndpoints;
