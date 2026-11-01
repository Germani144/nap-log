// The push sender reads its settings from the app's js/config.js (sender/config.mjs), so a copy only edits that file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAppConfig, pagesAddress } from '../sender/config.mjs';

test('readAppConfig reads the three settings from js/config.js', () => {
  const c = readAppConfig(new URL('../js/config.js', import.meta.url));
  assert.match(c.APP_ADDRESS, /^https:\/\/[a-z0-9-]+\.github\.io\//);
  assert.ok(c.FIREBASE_CONFIG === null || (c.FIREBASE_CONFIG.projectId && c.FIREBASE_CONFIG.apiKey));
  assert.ok(c.VAPID_PUBLIC === null || /^[\w-]{80,}$/.test(c.VAPID_PUBLIC));
});

test('readAppConfig: a copy with sharing and reminders switched off', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'napcfg-')), 'config.js');
  fs.writeFileSync(
    f,
    "const APP_ADDRESS = 'https://a-friend.github.io/nap-log/';\nconst FIREBASE_CONFIG = null;\nconst VAPID_PUBLIC = null;\n",
  );
  assert.deepEqual(
    { ...readAppConfig(f) },
    { APP_ADDRESS: 'https://a-friend.github.io/nap-log/', FIREBASE_CONFIG: null, VAPID_PUBLIC: null },
  );
});

test('pagesAddress: the GitHub Pages address of a repository', () => {
  assert.equal(pagesAddress('Germani144/nap-log'), 'https://germani144.github.io/nap-log/');
  assert.equal(pagesAddress('A-Friend/my-naps'), 'https://a-friend.github.io/my-naps/');
  assert.equal(pagesAddress('someone/someone.github.io'), 'https://someone.github.io/');
  assert.equal(pagesAddress(undefined), null);
});
