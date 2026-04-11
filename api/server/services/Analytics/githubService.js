/**
 * GitHub Repository Service
 * Fetches and syncs SQL queries from GitHub repositories
 */

const { logger } = require('@librechat/data-schemas');
const { decryptCredentials } = require('./encryption');

const GITHUB_API_URL = 'https://api.github.com';

/**
 * Get GitHub API headers with authentication
 */
function getGitHubHeaders(accessToken) {
  return {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LibreChat-Analytics',
  };
}

/**
 * Test GitHub repository connection
 */
async function testGitHubConnection({ accessToken, owner, repo, branch = 'main' }) {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
      headers: getGitHubHeaders(accessToken),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Repository not found or access denied' };
      }
      if (response.status === 401) {
        return { success: false, error: 'Invalid or expired access token' };
      }
      return { success: false, error: `GitHub API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      metadata: {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        defaultBranch: data.default_branch,
        language: data.language,
      },
    };
  } catch (error) {
    logger.error('[GitHub Service] Error testing connection:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(accessToken, owner, repo, path, branch = 'main') {
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers: getGitHubHeaders(accessToken) },
    );

    if (!response.ok) {
      logger.warn(`[GitHub Service] Failed to fetch file ${path}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.encoding === 'base64' && data.content) {
      const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      return { content, sha: data.sha };
    }

    return null;
  } catch (error) {
    logger.error('[GitHub Service] Error fetching file:', error);
    return null;
  }
}

/**
 * Simple glob pattern matching - handles **, *, ?
 */
function matchGlob(path, pattern) {
  // Direct test for simple patterns first
  // If pattern ends with *.sql, it should match any path ending with .sql
  if (pattern === '**/*.sql') {
    return path.endsWith('.sql');
  }

  // For other patterns, convert to regex
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '\x00GLOB\x00') // Temporary placeholder
    .replace(/\*/g, '[^/]*')
    .replace(/\x00GLOB\x00/g, '(.*?/?)?') // ** matches zero or more directories
    .replace(/\?/g, '[^/]');

  regex = '^' + regex + '$';
  return new RegExp(regex).test(path);
}

/**
 * Fetch repository tree (list of all files)
 */
async function fetchRepoTree(
  accessToken,
  owner,
  repo,
  branch = 'main',
  includePatterns = ['**/*.sql'],
  excludePatterns = ['**/node_modules/**', '**/.git/**'],
) {
  try {
    logger.info('[GitHub Service] Fetching repo tree', { owner, repo, branch, includePatterns });

    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: getGitHubHeaders(accessToken) },
    );

    if (!response.ok) {
      logger.error(`[GitHub Service] Failed to fetch repo tree: ${response.status}`, {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const data = await response.json();

    logger.info(
      '[GitHub Service] Parsed JSON data: statusCode=' +
        response.status +
        ', keys=' +
        JSON.stringify(Object.keys(data)) +
        ', treeLength=' +
        (data.tree ? data.tree.length : 'none'),
    );

    // GitHub API returns { sha, url, tree: [], truncated } for trees
    // If data itself is an array, that's a different format
    if (Array.isArray(data)) {
      logger.info('[GitHub Service] Data is an array, not object');
      // Assume it's a direct array of items
      data = { tree: data };
    }

    if (data.truncated) {
      logger.warn('[GitHub Service] Repository tree is truncated, may miss some files');
    }

    if (!data.tree || data.tree.length === 0) {
      logger.warn('[GitHub Service] Empty tree returned', {
        dataSha: data.sha,
        dataUrl: data.url,
        treeExists: !!data.tree,
        treeLength: data.tree?.length,
      });
      return [];
    }

    logger.info(
      '[GitHub Service] Repo tree fetched: totalItems=' +
        data.tree.length +
        ', sample=' +
        JSON.stringify(data.tree.slice(0, 3)),
    );

    // Filter files based on patterns
    const matchedFiles = data.tree
      .filter((item) => item.type === 'blob')
      .filter((item) => {
        const path = item.path;

        // Check exclude patterns first
        for (const pattern of excludePatterns) {
          if (matchGlob(path, pattern)) {
            return false;
          }
        }

        // Check include patterns
        for (const pattern of includePatterns) {
          if (matchGlob(path, pattern)) {
            return true;
          }
        }

        return false;
      })
      .map((item) => ({ path: item.path, sha: item.sha }));

    logger.info(
      '[GitHub Service] Pattern matching results: totalBlobs=' +
        data.tree.filter((item) => item.type === 'blob').length +
        ', patterns=' +
        JSON.stringify(includePatterns) +
        ', testMatch=' +
        matchGlob('available_days_in_AU.sql', '**/*.sql'),
    );

    return matchedFiles;
  } catch (error) {
    logger.error('[GitHub Service] Error fetching repo tree:', error);
    return [];
  }
}

/**
 * Sync SQL queries from GitHub repository
 */
async function syncGitHubQueries({
  accessToken,
  owner,
  repo,
  branch = 'main',
  includePatterns = ['**/*.sql'],
  excludePatterns = ['**/node_modules/**', '**/.git/**'],
}) {
  try {
    logger.info('[GitHub Service] Starting sync', { owner, repo, branch });

    const files = await fetchRepoTree(
      accessToken,
      owner,
      repo,
      branch,
      includePatterns,
      excludePatterns,
    );

    if (files.length === 0) {
      logger.warn('[GitHub Service] No SQL files found', { owner, repo, branch });
      return { success: true, queries: [], message: 'No SQL files found matching the patterns' };
    }

    const queries = [];
    const errors = [];

    for (const file of files) {
      const result = await fetchFileContent(accessToken, owner, repo, file.path, branch);

      if (result) {
        const name = file.path
          .split('/')
          .pop()
          .replace(/\.sql$/i, '')
          .replace(/[_-]/g, ' ');
        const description = extractSqlDescription(result.content);

        queries.push({
          name,
          path: file.path,
          sqlContent: result.content,
          description,
          sha: file.sha,
        });
      } else {
        errors.push(`Failed to fetch: ${file.path}`);
      }
    }

    logger.info('[GitHub Service] Sync completed', {
      owner,
      repo,
      totalFiles: files.length,
      successful: queries.length,
      failed: errors.length,
    });

    return {
      success: true,
      queries,
      totalFiles: files.length,
      syncedCount: queries.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    logger.error('[GitHub Service] Error syncing queries:', error);
    return { success: false, queries: [], error: error.message };
  }
}

/**
 * Extract description from SQL file comments
 */
function extractSqlDescription(sqlContent) {
  const patterns = [
    /--\s*description:\s*(.+)/i,
    /\/\*\s*description:\s*(.+?)\s*\*\//i,
    /--\s*@description\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = sqlContent.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Fetch and decrypt stored token for a GitHub repo connection
 */
async function getAccessToken(githubConnection) {
  if (!githubConnection.accessToken) {
    throw new Error('No access token stored for this GitHub connection');
  }

  try {
    const decrypted = decryptCredentials(githubConnection.accessToken);
    return decrypted;
  } catch (error) {
    logger.error('[GitHub Service] Error decrypting access token:', error);
    throw new Error('Failed to decrypt access token');
  }
}

module.exports = {
  testGitHubConnection,
  fetchFileContent,
  fetchRepoTree,
  syncGitHubQueries,
  getAccessToken,
  matchGlob,
  extractSqlDescription,
};
