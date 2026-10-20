// The service worker must behave on the origin all of Pedro's apps share: only its own caches, only its own folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSw } from './sw-harness.mjs';

const checks = await checkSw({ swPath: new URL('../sw.js', import.meta.url).pathname, repo: 'nap-log' });
for (const c of checks) test(c.name, () => assert.ok(c.pass, c.detail));
