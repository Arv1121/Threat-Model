import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  aggregateOptInSummaries,
  validateOptInRegistry
} from '../repo-scan.mjs';

const registryPath = resolve('data/opt-in-repositories.json');
const outputPath = resolve('data/repository-risk-summary.json');
const MAX_SUMMARY_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const MAX_CONCURRENCY = 10;

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const repositories = validateOptInRegistry(registry);
const summaries = await fetchSummaries(repositories);
const aggregate = aggregateOptInSummaries(registry, summaries);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(aggregate, null, 2)}\n`);
console.log(
  `Opt-in repository aggregate: ${aggregate.reportingRepositories}/${repositories.length} fresh reports; ` +
  `${aggregate.excludedReports} unavailable, invalid, or stale. Status: ${aggregate.status}.`
);

async function fetchSummaries(entries) {
  const results = new Array(entries.length);
  let nextIndex = 0;

  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENCY, entries.length) },
    async () => {
      while (nextIndex < entries.length) {
        const index = nextIndex++;
        results[index] = await fetchSummary(entries[index]);
      }
    }
  ));
  return results;
}

async function fetchSummary(entry) {
  const [owner, repository] = entry.repository.split('/');
  const branchPath = entry.branch.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/${owner}/${repository}/refs/heads/${branchPath}/.github/threatscope/summary.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
    if (!response.ok) return null;

    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_SUMMARY_BYTES) return null;
    return JSON.parse(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
