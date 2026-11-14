import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRepositoryScanSummary } from '../repo-scan.mjs';

const [reportPath, summaryPath] = process.argv.slice(2);
if (!reportPath || !summaryPath) {
  throw new Error('Usage: node create-scan-summary.mjs <osv-report.json> <summary.json>');
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const summary = createRepositoryScanSummary(report, {
  repository: process.env.GITHUB_REPOSITORY,
  branch: process.env.GITHUB_REF_NAME,
  commit: process.env.GITHUB_SHA
});

await mkdir(dirname(summaryPath), { recursive: true });
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });

if (process.env.GITHUB_OUTPUT) {
  const outputs = [
    `packagesScanned=${summary.packagesScanned}`,
    `affectedPackages=${summary.affectedPackages}`,
    `vulnerabilityMatches=${summary.vulnerabilityMatches}`
  ].join('\n');
  await appendFile(process.env.GITHUB_OUTPUT, `${outputs}\n`);
}
