export const MINIMUM_PUBLIC_REPOSITORIES = 10;
export const PUBLIC_SUMMARY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SUMMARY_KEYS = new Set([
  'schemaVersion',
  'generatedAt',
  'repository',
  'branch',
  'commit',
  'scannerVersion',
  'packagesScanned',
  'affectedPackages',
  'vulnerabilityMatches'
]);

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validRepositoryName(value) {
  return typeof value === 'string' &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(value);
}

function validBranch(value) {
  if (typeof value !== 'string' || value.length > 200) return false;
  return value.split('/').every((part) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part) && part !== '..'
  );
}

export function validateOptInRegistry(registry) {
  if (
    !registry ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.repositories) ||
    registry.repositories.length > 1000
  ) {
    throw new TypeError('Invalid opt-in repository registry');
  }

  const seen = new Set();
  return registry.repositories.map((entry) => {
    if (
      !entry ||
      Object.keys(entry).some((key) => !['repository', 'branch'].includes(key)) ||
      !validRepositoryName(entry.repository) ||
      !validBranch(entry.branch)
    ) {
      throw new TypeError('Each opt-in entry must contain a valid repository and branch');
    }

    const key = entry.repository.toLowerCase();
    if (seen.has(key)) throw new TypeError('Only one branch per repository may be opted in');
    seen.add(key);
    return { repository: entry.repository, branch: entry.branch };
  });
}

export function createRepositoryScanSummary(report, metadata) {
  if (!report || !Array.isArray(report.results)) {
    throw new TypeError('Invalid OSV-Scanner report');
  }
  if (
    !metadata ||
    !validRepositoryName(metadata.repository) ||
    !validBranch(metadata.branch) ||
    !/^[a-f0-9]{40}$/i.test(metadata.commit)
  ) {
    throw new TypeError('Repository, branch, and commit metadata are required');
  }

  let packagesScanned = 0;
  let affectedPackages = 0;
  let vulnerabilityMatches = 0;

  for (const result of report.results) {
    if (!result || !Array.isArray(result.packages)) {
      throw new TypeError('Invalid package data in OSV-Scanner report');
    }
    for (const packageResult of result.packages) {
      if (!packageResult || !Array.isArray(packageResult.vulnerabilities)) {
        throw new TypeError('Invalid vulnerability data in OSV-Scanner report');
      }
      packagesScanned += 1;
      if (packageResult.vulnerabilities.length > 0) affectedPackages += 1;
      vulnerabilityMatches += packageResult.vulnerabilities.length;
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: (metadata.now || new Date()).toISOString(),
    repository: metadata.repository,
    branch: metadata.branch,
    commit: metadata.commit,
    scannerVersion: 'v2.7.1',
    packagesScanned,
    affectedPackages,
    vulnerabilityMatches
  };
}

function validateRepositorySummary(summary, now) {
  if (
    !summary ||
    Object.keys(summary).some((key) => !SUMMARY_KEYS.has(key)) ||
    summary.schemaVersion !== 1 ||
    !validRepositoryName(summary.repository) ||
    !validBranch(summary.branch) ||
    !/^[a-f0-9]{40}$/i.test(summary.commit) ||
    summary.scannerVersion !== 'v2.7.1' ||
    !['packagesScanned', 'affectedPackages', 'vulnerabilityMatches'].every((key) => isCount(summary[key])) ||
    !isIsoTimestamp(summary.generatedAt)
  ) {
    return false;
  }
  if (
    summary.affectedPackages > summary.packagesScanned ||
    summary.vulnerabilityMatches < summary.affectedPackages
  ) {
    return false;
  }

  const generatedAt = Date.parse(summary.generatedAt);
  return Number.isFinite(generatedAt) &&
    generatedAt <= now.getTime() + 5 * 60 * 1000 &&
    now.getTime() - generatedAt <= PUBLIC_SUMMARY_MAX_AGE_MS;
}

export function aggregateOptInSummaries(registry, summaries, now = new Date()) {
  const repositories = validateOptInRegistry(registry);
  if (!Array.isArray(summaries) || summaries.length !== repositories.length) {
    throw new TypeError('Expected one summary result per opted-in repository');
  }

  const summaryByRepository = new Map();
  for (const summary of summaries) {
    if (!summary || !summary.repository || !summary.branch) continue;
    summaryByRepository.set(`${summary.repository.toLowerCase()}#${summary.branch}`, summary);
  }

  const freshSummaries = [];
  repositories.forEach((entry) => {
    const summary = summaryByRepository.get(`${entry.repository.toLowerCase()}#${entry.branch}`);
    if (summary && validateRepositorySummary(summary, now)) {
      freshSummaries.push(summary);
    }
  });

  const hasCohort = freshSummaries.length >= MINIMUM_PUBLIC_REPOSITORIES;
  const latestScan = freshSummaries.reduce((latest, summary) =>
    Math.max(latest, Date.parse(summary.generatedAt)), 0
  );

  return {
    schemaVersion: 1,
    status: hasCohort ? 'ready' : 'insufficient-cohort',
    updatedAt: hasCohort ? new Date(latestScan).toISOString() : null,
    minimumRepositories: MINIMUM_PUBLIC_REPOSITORIES,
    reportingRepositories: freshSummaries.length,
    excludedReports: repositories.length - freshSummaries.length,
    totals: hasCohort ? {
      packagesScanned: freshSummaries.reduce((sum, summary) => sum + summary.packagesScanned, 0),
      affectedPackages: freshSummaries.reduce((sum, summary) => sum + summary.affectedPackages, 0),
      vulnerabilityMatches: freshSummaries.reduce((sum, summary) => sum + summary.vulnerabilityMatches, 0)
    } : null
  };
}

export function validatePublicAggregate(aggregate) {
  const expectedKeys = [
    'schemaVersion',
    'status',
    'updatedAt',
    'minimumRepositories',
    'reportingRepositories',
    'excludedReports',
    'totals'
  ];
  if (
    !aggregate ||
    Object.keys(aggregate).some((key) => !expectedKeys.includes(key)) ||
    expectedKeys.some((key) => !Object.hasOwn(aggregate, key)) ||
    aggregate.schemaVersion !== 1 ||
    aggregate.minimumRepositories !== MINIMUM_PUBLIC_REPOSITORIES ||
    !isCount(aggregate.reportingRepositories) ||
    !isCount(aggregate.excludedReports) ||
    !['ready', 'insufficient-cohort'].includes(aggregate.status)
  ) {
    throw new TypeError('Invalid community repository aggregate');
  }

  if (aggregate.status === 'ready') {
    const updatedAt = Date.parse(aggregate.updatedAt);
    if (
      aggregate.reportingRepositories < MINIMUM_PUBLIC_REPOSITORIES ||
      !isIsoTimestamp(aggregate.updatedAt) ||
      updatedAt > Date.now() + 5 * 60 * 1000 ||
      Date.now() - updatedAt > PUBLIC_SUMMARY_MAX_AGE_MS ||
      !aggregate.totals ||
      Object.keys(aggregate.totals).length !== 3 ||
      !['packagesScanned', 'affectedPackages', 'vulnerabilityMatches'].every(
        (key) => isCount(aggregate.totals[key])
      )
    ) {
      throw new TypeError('Invalid ready community aggregate');
    }
  } else if (
    aggregate.reportingRepositories >= MINIMUM_PUBLIC_REPOSITORIES ||
    aggregate.updatedAt !== null ||
    aggregate.totals !== null
  ) {
    throw new TypeError('Insufficient-cohort aggregates must not disclose totals');
  }

  return aggregate;
}

export async function fetchCommunityAggregate(fetcher = globalThis.fetch) {
  const response = await fetcher('./data/repository-risk-summary.json', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`Community aggregate request failed with HTTP ${response.status}`);
  }
  return validatePublicAggregate(await response.json());
}
