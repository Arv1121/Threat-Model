import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGitHubLatestCommitDate,
  fetchGitHubRepository,
  parseGitHubRepositoryIdentifier,
  searchPublicGitHubRepositories
} from '../repo-intel.mjs';

const publicRepository = {
  private: false,
  full_name: 'owner/project',
  html_url: 'https://github.com/owner/project',
  description: 'A public project',
  language: 'JavaScript',
  default_branch: 'main',
  stargazers_count: 12,
  forks_count: 3,
  open_issues_count: 2,
  subscribers_count: 4,
  license: { spdx_id: 'MIT' },
  topics: ['security'],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  pushed_at: '2026-02-28T00:00:00Z',
  archived: false,
  disabled: false
};

test('accepts a single owner/repository identifier and rejects broad or malformed input', () => {
  assert.deepEqual(parseGitHubRepositoryIdentifier('owner/project'), {
    owner: 'owner',
    repository: 'project'
  });
  assert.throws(() => parseGitHubRepositoryIdentifier('owner'), /owner\/repository/);
  assert.throws(() => parseGitHubRepositoryIdentifier('owner/project/other'), /owner\/repository/);
  assert.throws(() => parseGitHubRepositoryIdentifier('https://github.com/owner/project'), /owner\/repository/);
  assert.throws(() => parseGitHubRepositoryIdentifier('owner/.'), /owner\/repository/);
  assert.throws(() => parseGitHubRepositoryIdentifier('owner/..'), /owner\/repository/);
});

test('fetches only the selected public repository and returns a bounded metadata record', async () => {
  const repository = await fetchGitHubRepository('owner/project', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/owner/project');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    return {
      ok: true,
      status: 200,
      json: async () => publicRepository
    };
  });

  assert.deepEqual(repository, {
    fullName: 'owner/project',
    url: 'https://github.com/owner/project',
    description: 'A public project',
    language: 'JavaScript',
    defaultBranch: 'main',
    stars: 12,
    forks: 3,
    openIssues: 2,
    watchers: 4,
    license: 'MIT',
    topics: ['security'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    pushedAt: '2026-02-28T00:00:00Z',
    archived: false,
    disabled: false
  });
});

test('reports missing, rate-limited, and malformed repository responses explicitly', async () => {
  await assert.rejects(
    fetchGitHubRepository('owner/project', async () => ({ ok: false, status: 404 })),
    /Public repository not found/
  );
  const beforeRetryLimit = Date.now();
  await assert.rejects(
    fetchGitHubRepository('owner/project', async () => ({
      ok: false,
      status: 403,
      headers: {
        get: (name) => name === 'X-RateLimit-Remaining'
          ? '0'
          : name === 'X-RateLimit-Reset'
            ? String(Math.ceil((Date.now() + 15000) / 1000))
            : null
      }
    })),
    (error) => {
      assert.match(error.message, /rate limit/);
      assert.ok(error.retryAt > beforeRetryLimit);
      return true;
    }
  );
  await assert.rejects(
    fetchGitHubRepository('owner/project', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...publicRepository, private: true })
    })),
    /invalid or non-public/
  );
});

test('searches public repositories with bounded, paginated results and safe website links', async () => {
  const searchItem = {
    private: false,
    full_name: 'owner/project',
    html_url: 'https://github.com/owner/project',
    description: 'Public project',
    homepage: 'project.example.org',
    language: 'JavaScript',
    default_branch: 'main',
    stargazers_count: 7,
    forks_count: 2,
    open_issues_count: 3,
    pushed_at: '2026-11-13T23:15:00Z',
    updated_at: '2026-11-14T00:00:00Z'
  };
  const result = await searchPublicGitHubRepositories('topic:security', 2, async (url, options) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.origin, 'https://api.github.com');
    assert.equal(requestUrl.pathname, '/search/repositories');
    assert.equal(requestUrl.searchParams.get('q'), 'topic:security is:public');
    assert.equal(requestUrl.searchParams.get('page'), '2');
    assert.equal(requestUrl.searchParams.get('per_page'), '100');
    assert.equal(requestUrl.searchParams.get('sort'), 'updated');
    assert.equal(options.cache, 'no-store');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 15,
        incomplete_results: false,
        items: [
          searchItem,
          { ...searchItem, full_name: 'owner/no-website', homepage: 'javascript:alert(1)' }
        ]
      })
    };
  });

  assert.equal(result.totalCount, 15);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 100);
  assert.equal(result.incomplete, false);
  assert.deepEqual(result.repositories.map(({ fullName, websiteUrl, pushedAt, forks, openIssues }) => ({
    fullName,
    websiteUrl,
    pushedAt,
    forks,
    openIssues
  })), [
    {
      fullName: 'owner/project',
      websiteUrl: 'https://project.example.org/',
      pushedAt: '2026-11-13T23:15:00Z',
      forks: 2,
      openIssues: 3
    },
    {
      fullName: 'owner/no-website',
      websiteUrl: null,
      pushedAt: '2026-11-13T23:15:00Z',
      forks: 2,
      openIssues: 3
    }
  ]);
  assert.deepEqual(
    await searchPublicGitHubRepositories('TOPIC:SECURITY', 2, async () => {
      throw new Error('Expected the cached search result');
    }),
    result
  );

  const recent = await searchPublicGitHubRepositories('', 1, async (url) => {
    assert.equal(new URL(url).searchParams.get('q'), 'is:public');
    return {
      ok: true,
      status: 200,
      json: async () => ({ total_count: 0, incomplete_results: false, items: [] })
    };
  });
  assert.equal(recent.totalCount, 0);
});

test('retrieves the latest default-branch commit date and handles empty repositories', async () => {
  const date = await fetchGitHubLatestCommitDate('owner/project', async (url) => {
    assert.equal(url, 'https://api.github.com/repos/owner/project/commits?per_page=1');
    return {
      ok: true,
      status: 200,
      json: async () => [{ commit: { committer: { date: '2026-11-13T23:15:00Z' } } }]
    };
  });
  assert.equal(date, '2026-11-13T23:15:00Z');
  assert.equal(
    await fetchGitHubLatestCommitDate('owner/project', async () => {
      throw new Error('Expected the cached commit date');
    }),
    date
  );

  assert.equal(
    await fetchGitHubLatestCommitDate('owner/empty', async () => ({ ok: false, status: 409 })),
    null
  );
  await assert.rejects(
    fetchGitHubLatestCommitDate('owner/malformed', async () => ({
      ok: true,
      status: 200,
      json: async () => [{ commit: {} }]
    })),
    /without a valid date/
  );
});

test('respects GitHub Retry-After when search is temporarily rate-limited', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    searchPublicGitHubRepositories('topic:retry-after-test', 1, async () => ({
      ok: false,
      status: 429,
      headers: { get: (name) => name === 'Retry-After' ? '5' : null }
    })),
    (error) => {
      assert.match(error.message, /rate limit/);
      assert.ok(error.retryAt >= startedAt + 5000);
      return true;
    }
  );
});
