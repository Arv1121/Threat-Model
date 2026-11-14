import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINIMUM_PUBLIC_REPOSITORIES,
  aggregateOptInSummaries,
  createRepositoryScanSummary,
  fetchCommunityAggregate,
  validateOptInRegistry,
  validatePublicAggregate
} from '../repo-scan.mjs';

const now = new Date();
const commit = 'a'.repeat(40);

function makeRegistry(count) {
  return {
    schemaVersion: 1,
    repositories: Array.from({ length: count }, (_, index) => ({
      repository: `owner/repo-${index}`,
      branch: 'main'
    }))
  };
}

function makeSummary(entry, options = {}) {
  return createRepositoryScanSummary({
    results: [{
      source: { path: '/private/worktree/package-lock.json', type: 'lockfile' },
      packages: [
        {
          package: { name: 'private-package-name', version: '1.2.3' },
          vulnerabilities: [{ id: 'CVE-2026-1234', summary: 'private advisory text' }]
        },
        { package: { name: 'safe-package', version: '4.5.6' }, vulnerabilities: [] }
      ]
    }]
  }, {
    repository: entry.repository,
    branch: entry.branch,
    commit,
    now: options.now || now
  });
}

test('creates a count-only summary without copying package, advisory, or path details', () => {
  const summary = makeSummary({ repository: 'owner/repo', branch: 'main' });
  assert.deepEqual(
    {
      packagesScanned: summary.packagesScanned,
      affectedPackages: summary.affectedPackages,
      vulnerabilityMatches: summary.vulnerabilityMatches
    },
    { packagesScanned: 2, affectedPackages: 1, vulnerabilityMatches: 1 }
  );
  const serialized = JSON.stringify(summary);
  for (const privateDetail of [
    'private-package-name',
    'CVE-2026-1234',
    'private advisory text',
    '/private/worktree'
  ]) {
    assert.equal(serialized.includes(privateDetail), false);
  }
});

test('rejects malformed scan reports and opt-in entries', () => {
  assert.throws(
    () => createRepositoryScanSummary({ results: [{ packages: [{}] }] }, {
      repository: 'owner/repo',
      branch: 'main',
      commit
    }),
    /Invalid vulnerability data/
  );
  assert.throws(
    () => validateOptInRegistry({
      schemaVersion: 1,
      repositories: [{ repository: 'owner/repo', branch: '../private' }]
    }),
    /valid repository and branch/
  );
  assert.throws(
    () => validateOptInRegistry({
      schemaVersion: 1,
      repositories: [
        { repository: 'owner/repo', branch: 'main' },
        { repository: 'owner/repo', branch: 'release' }
      ]
    }),
    /Only one branch per repository/
  );
});

test('hides totals below the cohort threshold and sums only fresh matching reports', () => {
  const registry = makeRegistry(MINIMUM_PUBLIC_REPOSITORIES + 1);
  const summaries = registry.repositories.map((entry) => makeSummary(entry));
  summaries[0] = makeSummary(registry.repositories[0], {
    now: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
  });
  summaries[1] = {
    ...summaries[1],
    repository: 'owner/another-repository'
  };

  const aggregate = aggregateOptInSummaries(registry, summaries, now);
  assert.equal(aggregate.status, 'insufficient-cohort');
  assert.equal(aggregate.reportingRepositories, MINIMUM_PUBLIC_REPOSITORIES - 1);
  assert.equal(aggregate.totals, null);
  assert.equal(aggregate.updatedAt, null);

  summaries[0] = makeSummary(registry.repositories[0]);
  const ready = aggregateOptInSummaries(registry, summaries, now);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.reportingRepositories, MINIMUM_PUBLIC_REPOSITORIES);
  assert.deepEqual(ready.totals, {
    packagesScanned: MINIMUM_PUBLIC_REPOSITORIES * 2,
    affectedPackages: MINIMUM_PUBLIC_REPOSITORIES,
    vulnerabilityMatches: MINIMUM_PUBLIC_REPOSITORIES
  });
  assert.equal(ready.excludedReports, 1);
});

test('accepts summaries in any order as long as they match the registry entries', () => {
  const registry = makeRegistry(MINIMUM_PUBLIC_REPOSITORIES);
  const summaries = [...registry.repositories]
    .reverse()
    .map((entry) => makeSummary(entry));

  const aggregate = aggregateOptInSummaries(registry, summaries, now);
  assert.equal(aggregate.status, 'ready');
  assert.equal(aggregate.reportingRepositories, MINIMUM_PUBLIC_REPOSITORIES);
  assert.deepEqual(aggregate.totals, {
    packagesScanned: MINIMUM_PUBLIC_REPOSITORIES * 2,
    affectedPackages: MINIMUM_PUBLIC_REPOSITORIES,
    vulnerabilityMatches: MINIMUM_PUBLIC_REPOSITORIES
  });
});

test('validates the public aggregate schema and rejects per-repository detail', () => {
  const registry = makeRegistry(MINIMUM_PUBLIC_REPOSITORIES);
  const ready = aggregateOptInSummaries(
    registry,
    registry.repositories.map((entry) => makeSummary(entry)),
    now
  );
  assert.equal(validatePublicAggregate(ready), ready);
  assert.throws(
    () => validatePublicAggregate({ ...ready, repositories: registry.repositories }),
    /Invalid community repository aggregate/
  );
  assert.throws(
    () => validatePublicAggregate({
      ...ready,
      status: 'insufficient-cohort',
      reportingRepositories: MINIMUM_PUBLIC_REPOSITORIES - 1
    }),
    /must not disclose totals/
  );
});

test('fetches and validates the static aggregate without treating failures as zero', async () => {
  const insufficient = {
    schemaVersion: 1,
    status: 'insufficient-cohort',
    updatedAt: null,
    minimumRepositories: MINIMUM_PUBLIC_REPOSITORIES,
    reportingRepositories: 0,
    excludedReports: 0,
    totals: null
  };
  const aggregate = await fetchCommunityAggregate(async (url, options) => {
    assert.equal(url, './data/repository-risk-summary.json');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => insufficient };
  });
  assert.equal(aggregate, insufficient);
  await assert.rejects(
    fetchCommunityAggregate(async () => ({ ok: false, status: 503 })),
    /HTTP 503/
  );
});
