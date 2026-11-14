# ThreatScope

ThreatScope is a browser-based defensive intelligence dashboard. It combines a sourced CISA Known Exploited Vulnerabilities (KEV) view, paginated public GitHub repository discovery, exact repository metadata lookup, optional authorized URL lookups, and a clearly separated learning library.

**Live site:** <https://arv1121.github.io/Threat-Model/>

## What it does

- Shows the CISA KEV catalog size, recent additions, known ransomware use, recent entries, and charts derived from the catalog.
- Links each live result to its NIST National Vulnerability Database record.
- Searches public GitHub repositories and displays paginated cards with the last-push date and listed project website; the exact default-branch commit date is requested only when selected on a card.
- Offers an exact repository lookup with direct links to that repository's security resources.
- Offers optional VirusTotal, URLScan.io, Shodan, and Have I Been Pwned lookups for authorized targets.
- Provides a feedback form that prepares a GitHub issue draft for review; it does not submit feedback automatically.
- Keeps evergreen educational material separate from current threat intelligence.

## Data freshness and privacy

The site remains a static GitHub Pages app; it has no application server or database. KEV data is fetched in the browser from the [AboutCode KEV mirror](https://github.com/aboutcode-org/aboutcode-mirror-kev), which refreshes daily from CISA. This is a periodically updated vulnerability catalog, not a real-time attack feed. Opening GitHub Discovery requests one page of up to 100 public repository results, sorted by recent update. Cards use GitHub's `pushed_at` timestamp, while an exact latest default-branch commit date is fetched only when requested on a card. Search results are cached briefly in the page to reduce API calls. GitHub exposes at most the first 1,000 matches per search, so this is not a complete listing of every public repository. Search terms and requested repository names go directly to GitHub's unauthenticated API and remain subject to its rate limits; the page respects rate-limit retry information when provided. The app does not enumerate the global repository catalog, crawl repository contents, or scan arbitrary repositories.

Other URL lookup requests go directly from the browser to the selected third-party service. Review each provider's terms before submitting URLs; URLScan.io submissions may be public. Feedback remains in the page until you follow the prepared issue link; GitHub receives the draft and any issue you submit is public. Do not include secrets or sensitive information. TLS and HTTP-header grades are not estimated because this static browser app cannot produce reliable checks for arbitrary hosts. If data is unavailable, the dashboard shows that state instead of substituting a clean result or sample data.

The home-page monthly chart is calculated from actual CISA KEV entry dates and labels catalog additions, not attack timing. If the source cannot be loaded, the chart stays unavailable rather than showing sample values. The learning library remains authored educational reference content, not a current incident feed.

Optional scanner API keys stay in browser memory for the current page session. Do not enter internal or sensitive URLs into public scanning services.

## Owner opt-in repository scanning

The community repository panel is **not** a global GitHub scan. It shows aggregate counts from public repositories whose owners intentionally enable the workflow and add their repository and branch to [`data/opt-in-repositories.json`](./data/opt-in-repositories.json). Unregistered repositories are never fetched or scanned by this project.

The scanner is [Google OSV-Scanner](https://github.com/google/osv-scanner), pinned to v2.7.1 and verified against its published Linux amd64 SHA-256. It checks supported dependency manifests, lockfiles, and SBOMs; it does not scan source code, secrets, or running services. Package identifiers and versions are sent to OSV's public vulnerability service for matching. Raw manifests and detailed scanner reports are not published from public repositories. A repository with no supported package sources is not counted as a clean scan and will not produce an aggregate report.

To opt in a **public** repository:

1. Copy [`examples/owner-opt-in-scan.yml`](./examples/owner-opt-in-scan.yml) into `.github/workflows/` in your repository. Review it and pin both ThreatScope references to the same reviewed commit SHA instead of `main` for reproducible workflow code.
2. Enable Actions with read/write contents permissions. The example scans the selected default branch daily, after dependency-file changes, or when manually dispatched. It writes only a count summary to `.github/threatscope/summary.json`; that file includes the repository, branch, commit, and counts, so the owner should review and consent to publishing it.
3. Open a pull request adding `{ "repository": "owner/repository", "branch": "main" }` to this project's opt-in registry. The selected branch must contain the summary file. Only one branch per repository may be registered.

The opt-in registry is public and identifies participating repositories and branches; enrollment is intentionally visible, so owners should consent to that disclosure too. Repository owners or maintainers should submit enrollment requests, and this project's maintainers should verify them before merging. The aggregator reads only those count-only summary files, ignores invalid or older-than-seven-day reports, and publishes **only combined totals** once at least 10 repositories have fresh reports. The community panel and aggregate JSON do not enumerate participants or per-repository results. Before the threshold is met, the page says the cohort is insufficient and displays no vulnerability totals—not zero. Aggregates refresh daily and are committed to this repository so GitHub Pages can serve them.

Private repositories can call the reusable workflow without publishing a summary. Detailed JSON is retained as a private Actions artifact for one day; private repositories are not included in the public aggregate. Remove the workflow and registry entry to opt out. This is dependency vulnerability matching, not a complete security audit.

## Run locally

Serve the repository over HTTP so the browser can load the JavaScript module:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/>. The page uses Chart.js from a CDN; no build or install step is needed.

## Tests

The feed and repository-summary helpers use Node's built-in test runner:

```bash
node --test tests/*.test.mjs
```

The same tests run in GitHub Actions for pushes and pull requests.

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/Arv1121/Threat-Model/issues/new/choose). Pull requests are welcome; run the tests before submitting.

There is no separate `LICENSE` file in the repository. Review the in-app Terms & Privacy page before reusing or redistributing the project.
