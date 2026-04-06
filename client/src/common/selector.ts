import React from 'react';
import { TStartupConfig } from 'librechat-data-provider';

export interface Endpoint {
  value: string;
  label: string;
  hasModels: boolean;
  models?: Array<{ name: string; isGlobal?: boolean }>;
  icon: React.ReactNode;
  agentNames?: Record<string, string>;
  assistantNames?: Record<string, string>;
  connectionNames?: Record<string, string>; // For Analytics connections
  connectionTypes?: Record<string, string>; // For database type mapping (e.g., mysql, postgresql, clickhouse)
  modelIcons?: Record<string, string | undefined>;
}

export interface SelectedValues {
  endpoint: string | null;
  model: string | null;
  modelSpec: string | null;
}

export interface ModelSelectorProps {
  startupConfig: TStartupConfig | undefined;
}
