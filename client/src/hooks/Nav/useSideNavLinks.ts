import { useMemo } from 'react';
import { Blocks, AttachmentIcon } from '@librechat/client';
// MCP Server - Commented out for future use
// import { MCPIcon } from '@librechat/client';
// MessageSquareQuote, Settings2 - Commented out for future use (prompts, parameters)
import {
  Database,
  Bookmark,
  ArrowRightToLine,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  TableProperties,
  Shield,
  Save,
  FileText,
} from 'lucide-react';
import {
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  isParamEndpoint,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  useCheckAdminAccessQuery,
} from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
// MCP Server - Commented out for future use
// import MCPBuilderPanel from '~/components/SidePanel/MCPBuilder/MCPBuilderPanel';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
// Prompts, Parameters, Memories - Commented out for future use
// import PromptsAccordion from '~/components/Prompts/PromptsAccordion';
// import Parameters from '~/components/SidePanel/Parameters/Panel';
// import { MemoryPanel } from '~/components/SidePanel/Memories';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import DatabaseConnectionsPanel from '~/components/SidePanel/DatabaseConnections/DatabaseConnectionsPanel';
import SkillsPanel from '~/components/SidePanel/Skills/SkillsPanel';
import { SchemaViewerPanel } from '~/components/SidePanel/SchemaViewer';
import { useHasAccess } from '~/hooks';
// MCP Server - Commented out for future use
// import { useMCPServerManager } from '~/hooks';

export default function useSideNavLinks({
  hidePanel,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
  endpointsConfig,
}: {
  hidePanel: () => void;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
  endpointsConfig: TEndpointsConfig;
}) {
  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.USE,
  });
  const hasAccessToReadMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });
  // MCP Server - Commented out for future use
  // const hasAccessToUseMCPSettings = useHasAccess({
  //   permissionType: PermissionTypes.MCP_SERVERS,
  //   permission: Permissions.USE,
  // });
  // const hasAccessToCreateMCP = useHasAccess({
  //   permissionType: PermissionTypes.MCP_SERVERS,
  //   permission: Permissions.CREATE,
  // });
  // const { availableMCPServers } = useMCPServerManager();

  // Check if user is admin
  const { data: adminAccess } = useCheckAdminAccessQuery();
  const isAdmin = adminAccess?.isAdmin ?? false;

  const Links = useMemo(() => {
    const links: NavLink[] = [];

    // Database Connections - positioned above agent builder
    links.push({
      title: 'com_sidepanel_database_connections',
      label: '',
      icon: Database,
      id: 'database-connections',
      Component: DatabaseConnectionsPanel,
    });

    // Schema Viewer - view cached database schemas
    links.push({
      title: 'com_sidepanel_schema_viewer',
      label: '',
      icon: TableProperties,
      id: 'schema-viewer',
      Component: SchemaViewerPanel,
    });

    // Skills - positioned below schema viewer
    links.push({
      title: 'com_sidepanel_skills',
      label: '',
      icon: BookOpen,
      id: 'skills',
      Component: SkillsPanel,
    });

    if (
      isAssistantsEndpoint(endpoint) &&
      ((endpoint === EModelEndpoint.assistants &&
        endpointsConfig?.[EModelEndpoint.assistants] &&
        endpointsConfig[EModelEndpoint.assistants].disableBuilder !== true) ||
        (endpoint === EModelEndpoint.azureAssistants &&
          endpointsConfig?.[EModelEndpoint.azureAssistants] &&
          endpointsConfig[EModelEndpoint.azureAssistants].disableBuilder !== true)) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: EModelEndpoint.assistants,
        Component: PanelSwitch,
      });
    }

    // Agent Builder - Hidden for now, can be brought back in future if needed
    // if (
    //   endpointsConfig?.[EModelEndpoint.agents] &&
    //   hasAccessToAgents &&
    //   hasAccessToCreateAgents &&
    //   endpointsConfig[EModelEndpoint.agents].disableBuilder !== true
    // ) {
    //   links.push({
    //     title: 'com_sidepanel_agent_builder',
    //     label: '',
    //     icon: Blocks,
    //     id: EModelEndpoint.agents,
    //     Component: AgentPanelSwitch,
    //   });
    // }

    // Prompts - Commented out for future use
    // if (hasAccessToPrompts) {
    //   links.push({
    //     title: 'com_ui_prompts',
    //     label: '',
    //     icon: MessageSquareQuote,
    //     id: 'prompts',
    //     Component: PromptsAccordion,
    //   });
    // }

    // Memories - Commented out for future use
    // if (hasAccessToMemories && hasAccessToReadMemories) {
    //   links.push({
    //     title: 'com_ui_memories',
    //     label: '',
    //     icon: Database,
    //     id: 'memories',
    //     Component: MemoryPanel,
    //   });
    // }

    // Parameters - Commented out for future use
    // if (
    //   interfaceConfig.parameters === true &&
    //   isParamEndpoint(endpoint ?? '', endpointType ?? '') === true &&
    //   !isAgentsEndpoint(endpoint) &&
    //   keyProvided
    // ) {
    //   links.push({
    //     title: 'com_sidepanel_parameters',
    //     label: '',
    //     icon: Settings2,
    //     id: 'parameters',
    //     Component: Parameters,
    //   });
    // }

    // Attach Files - Hidden for now, can be brought back in future if needed
    // links.push({
    //   title: 'com_sidepanel_attach_files',
    //   label: '',
    //   icon: AttachmentIcon,
    //   id: 'files',
    //   Component: FilesPanel,
    // });

    if (hasAccessToBookmarks) {
      links.push({
        title: 'com_sidepanel_conversation_tags',
        label: '',
        icon: Bookmark,
        id: 'bookmarks',
        Component: BookmarkPanel,
      });
    }

    // MCP Server - Commented out for future use
    // if (
    //   (hasAccessToUseMCPSettings && availableMCPServers && availableMCPServers.length > 0) ||
    //   hasAccessToCreateMCP
    // ) {
    //   links.push({
    //     title: 'com_nav_setting_mcp',
    //     label: '',
    //     icon: MCPIcon,
    //     id: 'mcp-builder',
    //     Component: MCPBuilderPanel,
    //   });
    // }

    links.push({
      title: 'com_sidepanel_hide_panel',
      label: '',
      icon: ArrowRightToLine,
      onClick: hidePanel,
      id: 'hide-panel',
    });

    // Navigation links (separate section below expandable links)
    links.push({
      title: 'com_nav_charts',
      label: '',
      icon: BarChart3,
      to: '/d/charts',
      id: 'charts',
    });

    links.push({
      title: 'com_nav_dashboards',
      label: '',
      icon: LayoutDashboard,
      to: '/d/dashboards',
      id: 'dashboards',
    });

    // Saved Queries - visible to all authenticated users
    links.push({
      title: 'com_nav_saved_queries',
      label: '',
      icon: Save,
      to: '/d/saved-queries',
      id: 'saved-queries',
    });

    // Context - visible to all authenticated users
    links.push({
      title: 'com_nav_context',
      label: '',
      icon: FileText,
      to: '/d/context',
      id: 'context',
    });

    // Admin Panel - visible only to admins
    if (isAdmin) {
      links.push({
        title: 'com_nav_admin',
        label: '',
        icon: Shield,
        to: '/d/admin',
        id: 'admin',
      });
    }

    return links;
  }, [
    endpoint,
    endpointsConfig,
    keyProvided,
    hasAccessToAgents,
    hasAccessToCreateAgents,
    hasAccessToPrompts,
    hasAccessToMemories,
    hasAccessToReadMemories,
    interfaceConfig.parameters,
    endpointType,
    hasAccessToBookmarks,
    // MCP Server - Commented out for future use
    // availableMCPServers,
    // hasAccessToUseMCPSettings,
    // hasAccessToCreateMCP,
    hidePanel,
    isAdmin,
  ]);

  return Links;
}
