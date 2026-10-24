// The app version lives in two places that must match: VER in the app and the cache name in sw.js.
// "Check for updates" on phones that run an OLDER version reads the new version out of sw.js with the regex below,
// so the cache-name line must keep exactly this shape (no spaces, single quotes) whatever the formatter does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const OLD_CLIENT_REGEX = /C=P\+'v([\d.]+)'/; // as in every release up to v3.14: never change this line's shape in sw.js

function appVersion() {
  const files = ['index.html', ...(existsSync(new URL('js/', root)) ? readdirSync(new URL('js/', root)).map((f) => 'js/' + f) : [])];
  const found = files.map((f) => /\bconst VER\s*=\s*['"]([\d.]+)['"]/.exec(read(f))).filter(Boolean);
  assert.equal(found.length, 1, 'VER is defined exactly once');
  return found[0][1];
}

test('sw.js cache name can be read by older app versions', () => {
  const m = OLD_CLIENT_REGEX.exec(read('sw.js'));
  assert.ok(m, 'sw.js no longer matches the regex older versions use');
});

test('VER and the sw.js cache name match', () => {
  assert.equal(OLD_CLIENT_REGEX.exec(read('sw.js'))[1], appVersion());
});

test('versions are vMAJOR.MINOR', () => {
  assert.match(appVersion(), /^\d+\.\d+$/);
});
