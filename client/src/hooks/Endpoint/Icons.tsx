import { Feather, BarChart3 } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import {
  GPTIcon,
  Sparkles,
  BedrockIcon,
  AssistantIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
} from '@librechat/client';
import type { IconMapProps, AgentIconMapProps, IconsRecord } from '~/common';
import UnknownIcon from './UnknownIcon';
import { cn } from '~/utils';

const AssistantAvatar = ({
  className = '',
  assistantName = '',
  avatar = '',
  context,
  size,
}: IconMapProps) => {
  if (assistantName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-cover"
        alt={assistantName}
        width="80"
        height="80"
      />
    );
  } else if (assistantName) {
    return <AssistantIcon className={cn('text-token-secondary', className)} size={size} />;
  }

  return <Sparkles className={cn(context === 'landing' ? 'icon-2xl' : '', className)} />;
};

const AgentAvatar = ({ className = '', avatar = '', agentName, size }: AgentIconMapProps) => {
  if (agentName != null && agentName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-cover"
        alt={agentName}
        width="80"
        height="80"
      />
    );
  }

  return <Feather className={cn(agentName === '' ? 'icon-2xl' : '', className)} size={size} />;
};

const Bedrock = ({ className = '' }: IconMapProps) => {
  return <BedrockIcon className={cn(className, 'h-full w-full')} />;
};

const AnalyticsIcon = ({ className = '', size }: IconMapProps) => {
  return <BarChart3 className={cn('text-token-secondary', className)} size={size} />;
};

const CloseAIIcon = ({ className = '', size }: IconMapProps) => {
  return (
    <img
      src="/assets/sqlguroo_48x48.png"
      alt="Data Source"
      className={cn('h-full w-full object-contain', className)}
      style={{ width: size || 20, height: size || 20 }}
    />
  );
};

export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.closeAI]: CloseAIIcon,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  [EModelEndpoint.agents]: AgentAvatar,
  [EModelEndpoint.bedrock]: Bedrock,
  [EModelEndpoint.analytics]: AnalyticsIcon,
  unknown: UnknownIcon,
};
