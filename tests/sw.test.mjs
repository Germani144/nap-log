// The service worker must behave on the origin all of Pedro's apps share: only its own caches, only its own folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSw } from './sw-harness.mjs';

const checks = await checkSw({ swPath: new URL('../sw.js', import.meta.url).pathname, repo: 'nap-log' });
for (const c of checks) test(c.name, () => assert.ok(c.pass, c.detail));

// every local script and stylesheet index.html loads is saved for offline use, so the app opens without a connection
test('sw.js saves every local file index.html loads', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = JSON.parse(
    sw
      .match(/const APP_FILES = (\[[\s\S]*?\]);/)[1]
      .replace(/'/g, '"')
      .replace(/,\s*\]/, ']'),
  );
  const local = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^https?:/.test(u));
  assert.ok(local.length > 3, 'found the local files');
  for (const u of local) assert.ok(listed.includes(u), u + ' is not saved for offline use');
  for (const u of listed.filter((u) => u !== './'))
    assert.ok(readFileSync(new URL('../' + u, import.meta.url)), u + ' exists');
});
