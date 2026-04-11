import githubRepoConnectionSchema from '~/schema/githubRepoConnection';
import type { IGitHubRepoConnection } from '~/types';

/**
 * Creates or returns the GitHubRepoConnection model using the provided mongoose instance and schema
 */
export function createGitHubRepoConnectionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.GitHubRepoConnection ||
    mongoose.model<IGitHubRepoConnection>('GitHubRepoConnection', githubRepoConnectionSchema)
  );
}