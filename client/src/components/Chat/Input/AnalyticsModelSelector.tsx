import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown, Lock, Brain } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { EModelEndpoint, SubscriptionPlan } from 'librechat-data-provider';
import { useGetSubscriptionQuery } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { TooltipAnchor, DropdownPopup } from '@librechat/client';
import type { MenuItemProps } from '~/common';
import { useEdition } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

// Available models for analytics
const ANALYTICS_MODELS = [
  // { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'openai' },
  // { id: 'gpt-5.2-codex', label: 'GPT-5.2-Codex', provider: 'openai' },
  { id: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max', provider: 'openai' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', provider: 'openrouter' },
  // { id: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'openrouter' },
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', provider: 'openrouter' },
  { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', provider: 'openrouter' },
  // { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', provider: 'openrouter' },
  { id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning', provider: 'xai' },
  // { id: 'mistralai/devstral-2512', label: 'Mistral Devstral 2512', provider: 'openrouter' },
  // { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B IT', provider: 'openrouter' },
  { id: 'z-ai/glm-5', label: 'Z.AI: GLM 5', provider: 'openrouter' },
  { id: 'z-ai/glm-4.7-flash', label: 'Z.AI: GLM 4.7 Flash', provider: 'openrouter' },
  { id: 'minimax/minimax-m2.7', label: 'MiniMax M2.7', provider: 'openrouter' },
  { id: 'qwen/qwen3-coder-next', label: 'Qwen3 Coder Next', provider: 'openrouter' },
  { id: 'xiaomi/mimo-v2-flash', label: 'Xiaomi MIMO v2 Flash', provider: 'openrouter' },
  { id: 'z-ai/glm-4.5-air:free', label: 'Z.AI: GLM 4.5 Air', provider: 'openrouter' },
  {
    id: 'arcee-ai/trinity-large-preview:free',
    label: 'Arcee Trinity Large',
    provider: 'openrouter',
  },
  // Claude models via OpenRouter (Pro/Ultra only)
] as const;

// Utility function to get provider logo URL from Simple Icons CDN
// Takes both provider and modelId to detect specific providers from OpenRouter models
const getProviderLogoUrl = (provider: string, modelId?: string): string | null => {
  if (!provider) return null;

  // Check model ID first for OpenRouter models that should use specific provider logos
  if (modelId) {
    if (modelId.startsWith('z-ai/')) {
      // Use Z.AI logo - using a generic AI/ML icon or Z logo if available
      // Since simple-icons doesn't have z-ai, we'll use a suitable alternative
      return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zend.svg';
    }
    if (modelId.startsWith('minimax/')) {
      // MiniMax logo - using a suitable icon
      return 'https://cdn.jsdelivr.net/npm/simple-icons@9.21.0/icons/misskey.svg';
    }
    if (modelId.startsWith('qwen/')) {
      // Qwen logo - using Alibaba Cloud (Qwen is from Alibaba)
      return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/alibabacloud.svg';
    }
    if (modelId.startsWith('google/')) {
      return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg';
    }
    if (modelId.startsWith('anthropic/')) {
      return 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/anthropic.svg';
    }
    if (modelId.startsWith('arcee-ai/')) {
      // Arcee AI logo - using a suitable alternative icon
      return 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/apachearrow.svg';
    }
  }

  const providerMap: Record<string, string> = {
    openai: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/openai.svg',
    anthropic: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/anthropic.svg',
    google: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg',
    xai: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/x.svg',
    openrouter: 'https://cdn.jsdelivr.net/npm/heroicons@2.0.18/24/outline/chart-bar.svg',
  };

  const normalizedProvider = provider.toLowerCase();
  return providerMap[normalizedProvider] || null;
};

// Default model for free users
const FREE_USER_MODEL = 'grok-code-fast-1';

// Models available to free users
const FREE_USER_MODELS = [
  'grok-code-fast-1',
  'xiaomi/mimo-v2-flash',
  'z-ai/glm-4.5-air:free',
  'arcee-ai/trinity-large-preview:free',
] as const;

export default function AnalyticsModelSelector() {
  const { conversation } = useChatContext();
  const { isEnterprise } = useEdition();
  const { data: subscriptionData } = useGetSubscriptionQuery();
  const [selectedModel, setSelectedModel] = useRecoilState(store.analyticsModel);
  const [agentType, setAgentType] = useRecoilState(store.agentType);
  const [isOpen, setIsOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const subscription = subscriptionData?.subscription;
  const plan = subscription?.plan || SubscriptionPlan.FREE;
  // In community mode, treat all users as non-free (all models available)
  const isFree = isEnterprise ? plan === SubscriptionPlan.FREE : false;

  // Determine if this is an analytics/closeAI conversation
  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );

  const isAnalyticsEndpoint =
    endpoint === EModelEndpoint.closeAI || endpoint === EModelEndpoint.analytics;

  // For free users, default to grok-code-fast-1 if not set
  const currentModel = useMemo(() => {
    if (!selectedModel) {
      const defaultModel = isFree ? FREE_USER_MODEL : ANALYTICS_MODELS[0].id;
      return defaultModel;
    }
    return selectedModel;
  }, [selectedModel, isFree]);

  // Set default model on mount if not set
  useEffect(() => {
    if (!selectedModel && isAnalyticsEndpoint) {
      const defaultModel = isFree ? FREE_USER_MODEL : ANALYTICS_MODELS[0].id;
      console.log('[AnalyticsModelSelector] Setting default model:', defaultModel, {
        isFree,
        isAnalyticsEndpoint,
      }); // ⭐ Debug: Default model
      setSelectedModel(defaultModel);
    }
  }, [selectedModel, isFree, isAnalyticsEndpoint, setSelectedModel]);

  const availableModels = useMemo(() => {
    if (isFree) {
      // Free users: only specific models are available
      return ANALYTICS_MODELS.map((model) => ({
        ...model,
        disabled: !FREE_USER_MODELS.includes(model.id as any),
      }));
    }
    // Paid users: all models available
    return ANALYTICS_MODELS.map((model) => ({
      ...model,
      disabled: false,
    }));
  }, [isFree]);

  const handleModelSelect = useMemo(() => {
    return (modelId: string) => {
      if (isFree && !FREE_USER_MODELS.includes(modelId as any)) {
        return; // Don't allow selection of unavailable models for free users
      }
      console.log('[AnalyticsModelSelector] Model selected and stored:', modelId); // ⭐ Debug: Model selection
      setSelectedModel(modelId);
      setIsOpen(false);
    };
  }, [isFree, setSelectedModel]);

  const handleMouseEnter = () => {
    // Clear any pending close timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    // Delay closing to allow moving from button to dropdown menu
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      hoverTimeoutRef.current = null;
    }, 200);
  };

  const currentModelData = ANALYTICS_MODELS.find((m) => m.id === currentModel);
  const currentModelLabel = currentModelData?.label || currentModel;
  const currentProviderLogoUrl = currentModelData?.provider
    ? getProviderLogoUrl(currentModelData.provider, currentModelData.id)
    : null;

  const dropdownItems: MenuItemProps[] = useMemo(() => {
    return availableModels.map((model) => {
      const providerLogoUrl = model.provider ? getProviderLogoUrl(model.provider, model.id) : null;
      return {
        label: model.label,
        render: (
          <div className="flex w-full items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {providerLogoUrl && (
                <img
                  src={providerLogoUrl}
                  alt={model.provider || ''}
                  className="h-3 w-3 flex-shrink-0 object-contain dark:invert"
                />
              )}
              <span className="truncate text-xs">{model.label}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {currentModel === model.id && (
                <span className="text-[10px] text-text-secondary">✓</span>
              )}
              {model.disabled && isFree && <Lock className="h-3 w-3 text-text-tertiary" />}
            </div>
          </div>
        ),
        onClick: () => handleModelSelect(model.id),
        disabled: model.disabled,
        show: true,
      };
    });
  }, [availableModels, currentModel, isFree, handleModelSelect]);

  const menuTrigger = (
    <TooltipAnchor description="Select AI model for analytics queries">
      <Ariakit.MenuButton
        id="analytics-model-selector-button"
        aria-label="Select analytics model"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'dark:border-border-dark flex items-center gap-1 rounded-lg border border-border-light bg-surface-chat px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
          isOpen && 'bg-surface-hover',
        )}
      >
        <div className="flex items-center gap-1">
          {currentProviderLogoUrl && (
            <img
              src={currentProviderLogoUrl}
              alt={currentModelData?.provider || ''}
              className="h-3 w-3 flex-shrink-0 object-contain dark:invert"
            />
          )}
          <span className="whitespace-nowrap text-[11px]">{currentModelLabel}</span>
        </div>
        <ChevronDown className="h-2.5 w-2.5" />
      </Ariakit.MenuButton>
    </TooltipAnchor>
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Don't show if not analytics endpoint (after all hooks are called)
  if (!isAnalyticsEndpoint) {
    return null;
  }

  // Agent type toggle handler
  const toggleAgentType = () => {
    setAgentType(agentType === 'react' ? 'legacy' : 'react');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Model Selector Dropdown */}
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="relative">
        <DropdownPopup
          menuId="analytics-model-selector"
          className="min-w-[160px]"
          itemClassName="py-1.5 px-2"
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          trigger={menuTrigger}
          items={dropdownItems}
          portal={true}
        />
      </div>

      {/* Agent Type Toggle Switch */}
      <TooltipAnchor
        description={
          agentType === 'react'
            ? 'ReAct Agent: Self-orchestrating with LangChain'
            : 'Legacy Agent: Step-by-step orchestrator'
        }
      >
        <button
          type="button"
          onClick={toggleAgentType}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            agentType === 'react'
              ? 'bg-green-500 dark:bg-green-600'
              : 'bg-gray-300 dark:bg-gray-600',
          )}
          aria-label={`Switch to ${agentType === 'react' ? 'legacy' : 'react'} agent`}
          role="switch"
          aria-checked={agentType === 'react'}
        >
          <span
            className={cn(
              'inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white transition-transform',
              agentType === 'react' ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          >
            <Brain className="h-2.5 w-2.5 text-black" />
          </span>
        </button>
      </TooltipAnchor>
    </div>
  );
}
