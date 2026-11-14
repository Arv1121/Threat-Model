export const GITHUB_REPOSITORY_API = 'https://api.github.com/repos/';
export const GITHUB_REPOSITORY_SEARCH_API = 'https://api.github.com/search/repositories';
export const GITHUB_REPOSITORY_SEARCH_PAGE_SIZE = 100;
export const GITHUB_REPOSITORY_SEARCH_LIMIT = 1000;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const COMMIT_CACHE_TTL_MS = 10 * 60 * 1000;
const repositorySearchCache = new Map();
const latestCommitCache = new Map();

function createRateLimitError(response) {
  const retryAfter = Number(response.headers?.get('Retry-After'));
  const remaining = response.headers?.get('X-RateLimit-Remaining');
  const resetAt = Number(response.headers?.get('X-RateLimit-Reset')) * 1000;
  const retryAt = Number.isFinite(retryAfter) && retryAfter > 0
    ? Date.now() + retryAfter * 1000
    : remaining === '0' && Number.isFinite(resetAt) && resetAt > Date.now()
      ? resetAt
      : Date.now() + 60 * 1000;
  const retrySeconds = Math.ceil((retryAt - Date.now()) / 1000);
  const error = new Error(`GitHub temporarily hit a rate limit. Retry in about ${retrySeconds} seconds.`);
  error.retryAt = retryAt;
  return error;
}

function publicWebsiteUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchGitHubJson(url, fetcher, resource, emptyStatuses = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetcher(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 403 || response.status === 429) {
      throw createRateLimitError(response);
    }
    if (emptyStatuses.includes(response.status)) return [];
    if (response.status === 404) {
      throw new Error(`${resource} not found. Check the repository and try again.`);
    }
    if (!response.ok) {
      throw new Error(`GitHub ${resource.toLowerCase()} request failed with HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseGitHubRepositoryIdentifier(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Enter a public GitHub repository as owner/repository');
  }

  const identifier = value.trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(identifier)) {
    throw new TypeError('Enter a public GitHub repository as owner/repository');
  }

  const [owner, repository] = identifier.split('/');
  if (repository === '.' || repository === '..') {
    throw new TypeError('Enter a public GitHub repository as owner/repository');
  }
  return { owner, repository };
}

export async function fetchGitHubRepository(identifier, fetcher = globalThis.fetch) {
  const { owner, repository } = parseGitHubRepositoryIdentifier(identifier);
  const repositoryData = await fetchGitHubJson(
    `${GITHUB_REPOSITORY_API}${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    fetcher,
    'Public repository'
  );
  if (
    !repositoryData ||
    repositoryData.private !== false ||
    typeof repositoryData.full_name !== 'string' ||
    typeof repositoryData.html_url !== 'string' ||
    !repositoryData.html_url.startsWith('https://github.com/') ||
    !Number.isSafeInteger(repositoryData.stargazers_count) ||
    !Number.isSafeInteger(repositoryData.forks_count) ||
    !Number.isSafeInteger(repositoryData.open_issues_count) ||
    typeof repositoryData.default_branch !== 'string'
  ) {
    throw new Error('GitHub returned an invalid or non-public repository record');
  }

  return {
    fullName: repositoryData.full_name,
    url: repositoryData.html_url,
    description: typeof repositoryData.description === 'string' ? repositoryData.description : '',
    language: typeof repositoryData.language === 'string' ? repositoryData.language : null,
    defaultBranch: repositoryData.default_branch,
    stars: repositoryData.stargazers_count,
    forks: repositoryData.forks_count,
    openIssues: repositoryData.open_issues_count,
    watchers: Number.isSafeInteger(repositoryData.subscribers_count)
      ? repositoryData.subscribers_count
      : 0,
    license: typeof repositoryData.license?.spdx_id === 'string'
      ? repositoryData.license.spdx_id
      : null,
    topics: Array.isArray(repositoryData.topics)
      ? repositoryData.topics.filter((topic) => typeof topic === 'string').slice(0, 20)
      : [],
    createdAt: typeof repositoryData.created_at === 'string' ? repositoryData.created_at : null,
    updatedAt: typeof repositoryData.updated_at === 'string' ? repositoryData.updated_at : null,
    pushedAt: typeof repositoryData.pushed_at === 'string' ? repositoryData.pushed_at : null,
    archived: repositoryData.archived === true,
    disabled: repositoryData.disabled === true
  };
}

export async function searchPublicGitHubRepositories(query = '', page = 1, fetcher = globalThis.fetch) {
  if (typeof query !== 'string' || query.length > 100) {
    throw new TypeError('Search must be 100 characters or fewer');
  }
  if (!Number.isInteger(page) || page < 1 ||
    page > Math.ceil(GITHUB_REPOSITORY_SEARCH_LIMIT / GITHUB_REPOSITORY_SEARCH_PAGE_SIZE)) {
    throw new RangeError('Repository search page is outside GitHub’s result limit');
  }

  const searchTerm = query.trim();
  const cacheKey = `${searchTerm.toLocaleLowerCase()}|${page}`;
  const cached = repositorySearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const params = new URLSearchParams({
    q: searchTerm ? `${searchTerm} is:public` : 'is:public',
    sort: 'updated',
    order: 'desc',
    per_page: String(GITHUB_REPOSITORY_SEARCH_PAGE_SIZE),
    page: String(page)
  });
  const result = await fetchGitHubJson(
    `${GITHUB_REPOSITORY_SEARCH_API}?${params}`,
    fetcher,
    'Repository search'
  );

  if (
    !result ||
    !Number.isSafeInteger(result.total_count) ||
    !Array.isArray(result.items) ||
    typeof result.incomplete_results !== 'boolean'
  ) {
    throw new Error('GitHub returned an invalid repository search response');
  }

  const repositories = result.items.map((item) => {
    if (
      !item ||
      item.private !== false ||
      typeof item.full_name !== 'string' ||
      typeof item.html_url !== 'string' ||
      !item.html_url.startsWith('https://github.com/') ||
      !Number.isSafeInteger(item.stargazers_count) ||
      !Number.isSafeInteger(item.forks_count) ||
      !Number.isSafeInteger(item.open_issues_count)
    ) {
      throw new Error('GitHub returned an invalid or non-public repository search result');
    }

    return {
      fullName: item.full_name,
      url: item.html_url,
      description: typeof item.description === 'string' ? item.description : '',
      websiteUrl: publicWebsiteUrl(item.homepage),
      language: typeof item.language === 'string' ? item.language : null,
      defaultBranch: typeof item.default_branch === 'string' ? item.default_branch : null,
      stars: item.stargazers_count,
      forks: item.forks_count,
      openIssues: item.open_issues_count,
      updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null,
      pushedAt: typeof item.pushed_at === 'string' ? item.pushed_at : null
    };
  });

  const searchResult = {
    repositories,
    totalCount: result.total_count,
    incomplete: result.incomplete_results,
    page,
    pageSize: GITHUB_REPOSITORY_SEARCH_PAGE_SIZE
  };
  repositorySearchCache.set(cacheKey, {
    result: searchResult,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
  });
  if (repositorySearchCache.size > 30) {
    repositorySearchCache.delete(repositorySearchCache.keys().next().value);
  }
  return searchResult;
}

export async function fetchGitHubLatestCommitDate(identifier, fetcher = globalThis.fetch) {
  const { owner, repository } = parseGitHubRepositoryIdentifier(identifier);
  const cacheKey = `${owner.toLocaleLowerCase()}/${repository.toLocaleLowerCase()}`;
  const cached = latestCommitCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.date;

  const commits = await fetchGitHubJson(
    `${GITHUB_REPOSITORY_API}${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=1`,
    fetcher,
    'Latest commit',
    [409]
  );
  if (!Array.isArray(commits)) {
    throw new Error('GitHub returned an invalid latest commit response');
  }
  if (commits.length === 0) {
    latestCommitCache.set(cacheKey, { date: null, expiresAt: Date.now() + COMMIT_CACHE_TTL_MS });
    return null;
  }

  const date = commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date;
  if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) {
    throw new Error('GitHub returned a commit without a valid date');
  }
  latestCommitCache.set(cacheKey, { date, expiresAt: Date.now() + COMMIT_CACHE_TTL_MS });
  return date;
}
