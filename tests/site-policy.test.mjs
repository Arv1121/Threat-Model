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
