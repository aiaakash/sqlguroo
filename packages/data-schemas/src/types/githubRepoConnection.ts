import type { Document, Types } from 'mongoose';

export enum GitHubProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
}

export interface IGitHubRepoConnection extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  provider: GitHubProvider;
  owner: string;
  repo: string;
  branch: string;
  queryPath?: string;
  includePatterns: string[];
  excludePatterns: string[];
  accessToken?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  lastSyncSuccess?: boolean;
  syncError?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGitHubRepoConnectionRequest {
  name: string;
  provider?: GitHubProvider;
  owner: string;
  repo: string;
  branch?: string;
  queryPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  accessToken: string;
}

export interface UpdateGitHubRepoConnectionRequest {
  name?: string;
  branch?: string;
  queryPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  accessToken?: string;
  isActive?: boolean;
}

export interface GitHubRepoConnectionResponse {
  _id: string;
  userId: string;
  name: string;
  provider: GitHubProvider;
  owner: string;
  repo: string;
  branch: string;
  queryPath?: string;
  includePatterns: string[];
  excludePatterns: string[];
  isActive: boolean;
  lastSyncedAt?: string;
  lastSyncSuccess?: boolean;
  syncError?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubFile {
  name: string;
  path: string;
  content: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

export interface GitHubQuery {
  name: string;
  path: string;
  sqlContent: string;
  description?: string;
  sha: string;
}

export interface SyncGitHubRepoResult {
  success: boolean;
  queriesFound: number;
  syncedAt: Date;
  error?: string;
}
