export const KEV_FEED_URL =
  'https://raw.githubusercontent.com/aboutcode-org/aboutcode-mirror-kev/main/known_exploited_vulnerabilities.json';

export async function fetchKevCatalog(fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(KEV_FEED_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`KEV feed request failed with HTTP ${response.status}`);
    }

    const catalog = await response.json();
    if (
      !catalog ||
      !Array.isArray(catalog.vulnerabilities) ||
      !Number.isInteger(catalog.count) ||
      typeof catalog.dateReleased !== 'string' ||
      Number.isNaN(Date.parse(catalog.dateReleased))
    ) {
      throw new Error('KEV feed returned an invalid catalog');
    }

    return catalog;
  } finally {
    clearTimeout(timeout);
  }
}

export function filterKevVulnerabilities(vulnerabilities, query = '') {
  if (!Array.isArray(vulnerabilities)) {
    throw new TypeError('Expected a KEV vulnerability list');
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return vulnerabilities
    .filter((vulnerability) => {
      if (!normalizedQuery) return true;
      return [
        vulnerability.cveID,
        vulnerability.vendorProject,
        vulnerability.product,
        vulnerability.vulnerabilityName,
        vulnerability.shortDescription
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => String(b.dateAdded || '').localeCompare(String(a.dateAdded || '')));
}

export function getKevStats(catalog, now = new Date()) {
  if (!catalog || !Array.isArray(catalog.vulnerabilities)) {
    throw new TypeError('Expected a KEV catalog');
  }

  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    30 * 24 * 60 * 60 * 1000;
  const addedInLast30Days = catalog.vulnerabilities.filter((vulnerability) => {
    const addedAt = Date.parse(`${vulnerability.dateAdded}T00:00:00Z`);
    return Number.isFinite(addedAt) && addedAt >= cutoff;
  }).length;

  return {
    total: catalog.count,
    addedInLast30Days,
    ransomwareKnown: catalog.vulnerabilities.filter(
      (vulnerability) => vulnerability.knownRansomwareCampaignUse === 'Known'
    ).length,
    catalogDate: catalog.dateReleased
  };
}

export function getKevMonthlyAdditions(vulnerabilities, now = new Date()) {
  if (!Array.isArray(vulnerabilities)) {
    throw new TypeError('Expected a KEV vulnerability list');
  }

  const firstMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      count: 0
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  vulnerabilities.forEach((vulnerability) => {
    const addedAt = Date.parse(`${vulnerability.dateAdded}T00:00:00Z`);
    if (!Number.isFinite(addedAt) || addedAt < firstMonth) return;
    const date = new Date(addedAt);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = monthByKey.get(key);
    if (month) month.count += 1;
  });

  return months;
}

export function getTopKevVendors(vulnerabilities, limit = 8) {
  if (!Array.isArray(vulnerabilities)) {
    throw new TypeError('Expected a KEV vulnerability list');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Vendor limit must be a positive integer');
  }

  const counts = new Map();
  vulnerabilities.forEach(({ vendorProject }) => {
    if (typeof vendorProject === 'string' && vendorProject.trim()) {
      counts.set(vendorProject, (counts.get(vendorProject) || 0) + 1);
    }
  });

  return [...counts.entries()]
    .map(([vendor, count]) => ({ vendor, count }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor))
    .slice(0, limit);
}
