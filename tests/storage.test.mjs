// The localStorage helpers (js/storage.js): keys are "nap-log.<name>", and the old "nt_<name>" keys are moved over once.
// The real file is run against a fake localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../js/storage.js', import.meta.url), 'utf8');
assert.match(src, /const LS = 'nap-log\.';/);

function fakeStorage(initial = {}, { failSet = false } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (failSet) throw new Error('quota');
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}
const boot = (localStorage) =>
  new Function('localStorage', `${src}; return {load,save,lsGet,lsSet,lsDel}`)(localStorage);

// made-up values: never put a real family code in a test
const OLD = {
  nt_family: '"test-family-code"',
  nt_settings: '{"a":1}',
  nt_entries: '[{"id":1}]',
  nt_extra: '{"day":"2026-10-20","n":1}',
  nt_pushoff: '1',
  nt_statsN: '14',
};

test('old nt_ keys are moved to nap-log. and removed', () => {
  const ls = fakeStorage(OLD);
  const a = boot(ls);
  assert.equal(a.load('family', ''), 'test-family-code');
  for (const [k, v] of Object.entries(OLD)) {
    const name = k.slice(3);
    assert.equal(ls.getItem('nap-log.' + name), v, name);
    assert.equal(ls.getItem(k), null, 'old key left behind: ' + k);
  }
});

test('the family code survives the move as a string, entries as data', () => {
  const ls = fakeStorage({ nt_family: '"abc-123"', nt_entries: '[{"id":7}]' });
  const a = boot(ls);
  assert.equal(a.load('family', ''), 'abc-123');
  assert.deepEqual(a.load('entries', []), [{ id: 7 }]);
});

test('an existing nap-log. value is never overwritten by an old one', () => {
  const ls = fakeStorage({ 'nap-log.statsN': '7', nt_statsN: '30' });
  boot(ls);
  assert.equal(ls.getItem('nap-log.statsN'), '7');
  assert.equal(ls.getItem('nt_statsN'), null);
});

test('turning push back on is not undone by a leftover old key', () => {
  const ls = fakeStorage({ nt_pushoff: '1' });
  const a = boot(ls);
  assert.equal(a.lsGet('pushoff'), '1');
  a.lsDel('pushoff');
  assert.equal(a.lsGet('pushoff'), null);
  assert.equal(boot(ls).lsGet('pushoff'), null, 'second launch brings it back');
});

test('running it twice changes nothing', () => {
  const ls = fakeStorage(OLD);
  boot(ls);
  const snap = JSON.stringify([...ls.m]);
  boot(ls);
  assert.equal(JSON.stringify([...ls.m]), snap);
});

test('if writing fails, the old keys are kept', () => {
  const ls = fakeStorage(OLD, { failSet: true });
  boot(ls);
  for (const k of Object.keys(OLD)) assert.equal(ls.getItem(k), OLD[k], k);
});

test("other apps' keys are never touched", () => {
  const others = { 'cart-log.items': '[1]', 'lift-log:w': '{}', 'rideguide.v1': '{}', nt_other: 'x' };
  const ls = fakeStorage({ ...OLD, ...others });
  boot(ls);
  for (const [k, v] of Object.entries(others)) assert.equal(ls.getItem(k), v, k);
});

test('save and load round-trip under the nap-log. prefix', () => {
  const ls = fakeStorage();
  const a = boot(ls);
  a.save('settings', { x: 2 });
  assert.equal(ls.getItem('nap-log.settings'), '{"x":2}');
  assert.deepEqual(a.load('settings', {}), { x: 2 });
  assert.deepEqual(a.load('missing', 5), 5);
});
