import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Content Security Policy permits same-origin community aggregate requests', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const content = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(content, 'CSP meta policy must be present');

  const connectSource = content
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .find(([name]) => name === 'connect-src');
  assert.ok(connectSource?.includes("'self'"), 'connect-src must allow same-origin fetches');
});

test('ThreatScope mind map is browseable without a repository search', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const mapStart = html.indexOf('<div id="page-map" class="page">');
  const mapEnd = html.indexOf('<!-- PAGE: SCANNER -->', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart, 'mind map page must be present');

  const mapPage = html.slice(mapStart, mapEnd);
  assert.match(mapPage, /CISA Known Exploited Vulnerabilities/);
  assert.match(mapPage, /GitHub REST API/);
  assert.match(mapPage, /OSV-Scanner \+ OSV/);
  assert.equal(mapPage.includes('<form'), false, 'mind map must not require repository input');
  assert.equal(mapPage.includes('owner/repository'), false);
});
