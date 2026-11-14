# ThreatScope

ThreatScope is a browser-based security dashboard for defenders. It combines an authorized URL-scanning interface, practical security references, and a live view of CISA's Known Exploited Vulnerabilities (KEV) catalog.

**Live site:** <https://arv1121.github.io/Threat-Model/>

## What it does

- Searches the CISA KEV catalog by CVE, vendor, product, or vulnerability description.
- Shows the catalog size, recent additions, known ransomware use, and charts derived from the catalog.
- Links each live result to its NIST National Vulnerability Database record.
- Offers optional VirusTotal, URLScan.io, Shodan, and Have I Been Pwned scanner integrations.
- Includes security references and a clearly labeled simulated globe. The globe does not show real attacks or telemetry.

## Data freshness and privacy

The site remains a static GitHub Pages app; it has no application server or database. KEV data is fetched in the browser from the [AboutCode KEV mirror](https://github.com/aboutcode-org/aboutcode-mirror-kev), which refreshes daily from CISA. This is a periodically updated vulnerability catalog, not a real-time attack feed. Other scanner requests go directly from the browser to the selected third-party service. Review each provider's terms before submitting URLs; URLScan.io submissions may be public.

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

Open <http://localhost:8000/>. The page uses Three.js and Chart.js from pinned CDN URLs; no build or install step is needed.

## Tests

The feed and repository-summary helpers use Node's built-in test runner:

```bash
node --test tests/*.test.mjs
```

The same tests run in GitHub Actions for pushes and pull requests.

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/Arv1121/Threat-Model/issues/new/choose). Pull requests are welcome; run the tests before submitting.

There is no separate `LICENSE` file in the repository. Review the in-app Terms & Privacy page before reusing or redistributing the project.
