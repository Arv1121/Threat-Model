import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchKevCatalog,
  filterKevVulnerabilities,
  getKevMonthlyAdditions,
  getKevStats,
  getTopKevVendors
} from '../threat-feed.mjs';

const vulnerabilities = [
  {
    cveID: 'CVE-2026-0003',
    vendorProject: 'Acme',
    product: 'Widget',
    vulnerabilityName: 'Widget auth bypass',
    shortDescription: 'Authentication issue',
    dateAdded: '2026-03-14',
    knownRansomwareCampaignUse: 'Known'
  },
  {
    cveID: 'CVE-2026-0002',
    vendorProject: 'Acme',
    product: 'Widget Pro',
    vulnerabilityName: 'Widget Pro injection',
    shortDescription: 'Input validation issue',
    dateAdded: '2026-02-13',
    knownRansomwareCampaignUse: 'Unknown'
  },
  {
    cveID: 'CVE-2025-0001',
    vendorProject: 'Other',
    product: 'Tool',
    vulnerabilityName: 'Tool flaw',
    shortDescription: 'Legacy issue',
    dateAdded: '2025-01-01',
    knownRansomwareCampaignUse: 'Unknown'
  }
];

test('fetches and validates the public catalog', async () => {
  const expected = {
    count: 1,
    dateReleased: '2026-03-14T00:00:00Z',
    vulnerabilities: [vulnerabilities[0]]
  };
  const catalog = await fetchKevCatalog(async (url, options) => {
    assert.match(url, /known_exploited_vulnerabilities\.json$/);
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => expected };
  });
  assert.equal(catalog, expected);

  await assert.rejects(
    fetchKevCatalog(async () => ({ ok: false, status: 503 })),
    /HTTP 503/
  );
  await assert.rejects(
    fetchKevCatalog(async () => ({
      ok: true,
      json: async () => ({ count: 1, dateReleased: 'not-a-date', vulnerabilities: [] })
    })),
    /invalid catalog/
  );
});

test('filters catalog fields case-insensitively and sorts newest first', () => {
  assert.deepEqual(
    filterKevVulnerabilities(vulnerabilities, 'WIDGET').map((item) => item.cveID),
    ['CVE-2026-0003', 'CVE-2026-0002']
  );
  assert.deepEqual(
    filterKevVulnerabilities(vulnerabilities, 'CVE-2025-0001').map((item) => item.cveID),
    ['CVE-2025-0001']
  );
});

test('calculates catalog counts using the supplied UTC date', () => {
  const stats = getKevStats({
    count: 3,
    dateReleased: '2026-03-14T00:00:00Z',
    vulnerabilities
  }, new Date('2026-03-15T12:00:00Z'));
  assert.deepEqual(stats, {
    total: 3,
    addedInLast30Days: 2,
    ransomwareKnown: 1,
    catalogDate: '2026-03-14T00:00:00Z'
  });
});

test('groups recent additions by month and ranks vendors deterministically', () => {
  const monthly = getKevMonthlyAdditions([
    ...vulnerabilities,
    { ...vulnerabilities[2], cveID: 'CVE-2025-0002', dateAdded: '2025-04-04' }
  ], new Date('2026-03-15T12:00:00Z'));
  assert.equal(monthly.length, 12);
  assert.deepEqual(monthly[0], { key: '2025-04', label: 'Apr 25', count: 1 });
  assert.deepEqual(monthly[11], { key: '2026-03', label: 'Mar 26', count: 1 });
  assert.deepEqual(getTopKevVendors(vulnerabilities), [
    { vendor: 'Acme', count: 2 },
    { vendor: 'Other', count: 1 }
  ]);
});
