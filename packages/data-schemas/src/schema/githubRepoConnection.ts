import { Schema } from 'mongoose';
import type { IGitHubRepoConnection } from '~/types';
import { GitHubProvider } from '~/types';

const githubRepoConnectionSchema = new Schema<IGitHubRepoConnection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Connection name is required'],
      trim: true,
      maxlength: [100, 'Connection name cannot exceed 100 characters'],
    },
    provider: {
      type: String,
      enum: Object.values(GitHubProvider),
      default: GitHubProvider.GITHUB,
    },
    owner: {
      type: String,
      required: [true, 'Repository owner is required'],
      trim: true,
    },
    repo: {
      type: String,
      required: [true, 'Repository name is required'],
      trim: true,
    },
    branch: {
      type: String,
      default: 'main',
    },
    queryPath: {
      type: String,
      description: 'Path in repo to scan for .sql files (defaults to root)',
    },
    includePatterns: {
      type: [String],
      default: ['**/*.sql'],
      description: 'Glob patterns for files to include',
    },
    excludePatterns: {
      type: [String],
      default: ['**/node_modules/**', '**/.git/**'],
      description: 'Glob patterns for files to exclude',
    },
    accessToken: {
      type: String,
      select: false,
      description: 'Encrypted GitHub PAT or token',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    lastSyncSuccess: {
      type: Boolean,
    },
    syncError: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      description: 'Additional metadata (stars, size, etc.)',
    },
    connectionIds: {
      type: [Schema.Types.ObjectId],
      ref: 'DatabaseConnection',
      default: [],
      description: 'Linked database connection IDs for targeted RAG',
    },
  },
  {
    timestamps: true,
  },
);

githubRepoConnectionSchema.index({ userId: 1, isActive: 1 });
githubRepoConnectionSchema.index({ userId: 1, owner: 1, repo: 1 });
githubRepoConnectionSchema.index({ lastSyncedAt: 1 });
githubRepoConnectionSchema.index({ connectionIds: 1 });

export default githubRepoConnectionSchema;
