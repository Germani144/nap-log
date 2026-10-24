// Tests for Export data / Import data (backup.js). Run: TZ=Europe/Copenhagen node --test tests/
// All data here is made up: never build a test from a real export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { okE, okS, Backup } = createRequire(import.meta.url)('../backup.js');
const { makeExport, fileName, toText, parseImport, planImport, summarize, FORMAT, VERSION } = Backup;

const NOW = new Date(2026, 9, 22, 20, 0).getTime(); // "now" = 22 Oct 2026 20:00 local
const at = (day, h, m) => new Date(2026, 9, 22 + day, h, m).getTime(); // day 0 = today, -1 = yesterday
const nap = (id, d, h1, m1, h2, m2, pred) => ({
  id,
  type: 'nap',
  start: at(d, h1, m1),
  end: h2 == null ? null : at(d, h2, m2),
  ...(pred ? { pred } : {}),
});
const night = (id, d, h1, m1, h2, m2) => ({
  id,
  type: 'night',
  start: at(d, h1, m1),
  end: h2 == null ? null : at(d + 1, h2, m2),
});
const ENTRIES = [
  night('g1', -3, 19, 30, 6, 40),
  nap('a1', -2, 9, 0, 9, 45, { s: at(-2, 8, 55), len: 50, n: 1, v: '3.9' }),
  nap('a2', -2, 13, 0, 14, 20),
  night('g2', -2, 19, 20, 6, 10),
  nap('a3', -1, 8, 50, 9, 30),
];
const STATE = {
  entries: ENTRIES,
  settings: { targetNaps: 3, bedtime: '19:15' },
  extraNaps: { day: '2026-10-22', n: 1 },
  prefs: { statsN: 14, pushOff: true },
  family: 'made-up family code do not export',
};
const exp = () => makeExport(STATE, NOW, '3.10');
const imp = (obj) => parseImport(typeof obj === 'string' ? obj : JSON.stringify(obj), NOW);

test('export: format, version, file name, sorted entries', () => {
  const x = exp();
  assert.equal(x.format, FORMAT);
  assert.equal(x.version, VERSION);
  assert.equal(x.app, '3.10');
  assert.equal(x.exportedAt, NOW);
  assert.equal(fileName(NOW), 'nap-log-2026-10-22.json');
  assert.equal(fileName(new Date(2026, 0, 5, 0, 30).getTime()), 'nap-log-2026-01-05.json');
  assert.deepEqual(
    x.entries.map((e) => e.id),
    ['g1', 'a1', 'a2', 'g2', 'a3'],
  );
  assert.deepEqual(x.settings, { targetNaps: 3, bedtime: '19:15' });
  assert.deepEqual(x.extraNaps, { day: '2026-10-22', n: 1 });
  assert.deepEqual(x.prefs, { statsN: 14, pushOff: true });
});

test('export never contains the family code', () => {
  const t = toText(exp());
  assert.ok(!t.includes('made-up family code'));
  assert.ok(!/family/i.test(t));
  assert.deepEqual(Object.keys(exp()).sort(), [
    'app',
    'entries',
    'exportedAt',
    'extraNaps',
    'format',
    'prefs',
    'settings',
    'version',
  ]);
});

test('export drops invalid entries, duplicates and unknown fields', () => {
  const x = makeExport(
    {
      entries: [
        ...ENTRIES,
        { id: 'bad id!', type: 'nap', start: 1 },
        { ...ENTRIES[1] },
        { ...ENTRIES[4], secret: 'x', pred: { s: 'no' } },
      ],
    },
    NOW,
    '3.10',
  );
  assert.equal(x.entries.length, 5);
  const a3 = x.entries.find((e) => e.id === 'a3');
  assert.deepEqual(Object.keys(a3).sort(), ['end', 'id', 'start', 'type']);
});

test('round-trip: export, then import gives the same data back', () => {
  const r = imp(toText(exp()));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.data.entries, exp().entries);
  assert.deepEqual(r.data.settings, STATE.settings);
  assert.deepEqual(r.data.extraNaps, STATE.extraNaps);
  assert.deepEqual(r.data.prefs, { statsN: 14 }); // push on/off belongs to each phone: not restored
  assert.equal(r.data.entries.find((e) => e.id === 'a1').pred.len, 50);
  // exporting what was imported gives an identical file
  const again = makeExport({ ...r.data, prefs: { statsN: 14, pushOff: true } }, NOW, '3.10');
  assert.equal(toText(again), toText(exp()));
});

test('round-trip of an empty log', () => {
  const r = imp(makeExport({ entries: [] }, NOW, '3.10'));
  assert.ok(r.ok, r.error);
  assert.equal(r.data.entries.length, 0);
  assert.deepEqual(r.summary, {
    count: 0,
    naps: 0,
    nights: 0,
    first: null,
    last: null,
    version: 1,
    app: '3.10',
    exportedAt: NOW,
  });
});

test('preview summary: counts and date range', () => {
  const r = imp(exp());
  assert.equal(r.summary.count, 5);
  assert.equal(r.summary.naps, 3);
  assert.equal(r.summary.nights, 2);
  assert.equal(r.summary.first, at(-3, 19, 30));
  assert.equal(r.summary.last, at(-1, 8, 50));
  assert.equal(r.summary.app, '3.10');
});

test('old exports with missing fields are accepted', () => {
  const old = {
    format: FORMAT,
    version: 1,
    entries: [
      { id: 'o1', type: 'nap', start: at(-5, 9, 0), end: at(-5, 10, 0) }, // no pred
      { id: 'o2', type: 'night', start: at(-5, 19, 0), end: at(-4, 6, 0) },
    ],
  }; // no settings, extraNaps, prefs, app, exportedAt
  const r = imp(old);
  assert.ok(r.ok, r.error);
  assert.equal(r.data.entries.length, 2);
  assert.equal(r.data.settings, null);
  assert.equal(r.data.extraNaps, null);
  assert.equal(r.data.prefs, null);
  assert.equal(r.summary.app, null);
  assert.equal(r.summary.exportedAt, null);
  // an entry with no end field at all counts as still running: fine when recent
  const run = imp({ format: FORMAT, version: 1, entries: [{ id: 'o3', type: 'nap', start: NOW - 20 * 6e4 }] });
  assert.ok(run.ok, run.error);
  assert.equal(run.data.entries[0].end, null);
});

test('bad files are refused with a message', () => {
  const good = exp(),
    E = good.entries;
  const cases = {
    empty: '',
    'not JSON': '{oops',
    array: '[]',
    'other format': { ...good, format: 'lift-log-export' },
    'no format': { version: 1, entries: [] },
    'no version': { ...good, version: undefined },
    'version 0': { ...good, version: 0 },
    'version as text': { ...good, version: '1' },
    'newer version': { ...good, version: VERSION + 1 },
    'no entries': { ...good, entries: undefined },
    'entries not a list': { ...good, entries: {} },
    'bad id': { ...good, entries: [{ ...E[0], id: '<img src=x onerror=alert(1)>' }] },
    'bad type': { ...good, entries: [{ ...E[0], type: 'feed' }] },
    'start as text': { ...good, entries: [{ ...E[0], start: String(E[0].start) }] },
    'duplicate id': { ...good, entries: [E[0], { ...E[1], id: E[0].id }] },
    'ends before start': { ...good, entries: [{ ...E[1], end: E[1].start - 6e4 }] },
    'longer than a day': { ...good, entries: [{ ...E[1], end: E[1].start + 2 * 864e5 }] },
    'year 1970': { ...good, entries: [{ ...E[1], start: 0, end: 6e4 }] },
    'far future': { ...good, entries: [{ ...E[1], start: NOW + 5 * 864e5, end: NOW + 5 * 864e5 + 6e4 }] },
    'old entry still open': { ...good, entries: [{ ...E[1], end: null }] },
    'broken pred': { ...good, entries: [{ ...E[1], pred: { s: 'soon' } }] },
    'bad settings': { ...good, settings: { targetNaps: 30, bedtime: '19:30' } },
    'bad bedtime': { ...good, settings: { targetNaps: 3, bedtime: '<b>7pm</b>' } },
    'bad extra naps': { ...good, extraNaps: { day: 'today', n: 1 } },
    'bad prefs': { ...good, prefs: { statsN: 9999 } },
    'bad app version': { ...good, app: '<script>' },
  };
  for (const [name, v] of Object.entries(cases)) {
    const r = imp(v);
    assert.equal(r.ok, false, name);
    assert.equal(typeof r.error, 'string', name);
    assert.ok(r.error.length > 0, name);
    assert.ok(!('data' in r), name + ': nothing to write');
  }
});

test('one bad entry refuses the whole file', () => {
  const x = exp();
  x.entries.push({ id: 'zz', type: 'nap', start: 'x' });
  const r = imp(x);
  assert.equal(r.ok, false);
  assert.match(r.error, /Entry 6/);
});

test('unknown fields in entries are not imported', () => {
  const x = exp();
  x.entries[0] = { ...x.entries[0], note: '<b>hi</b>', family: 'abc' };
  const r = imp(x);
  assert.ok(r.ok, r.error);
  assert.deepEqual(Object.keys(r.data.entries.find((e) => e.id === 'g1')).sort(), ['end', 'id', 'start', 'type']);
});

test('merge: adds missing entries, keeps existing ones unchanged', () => {
  const existing = [{ ...ENTRIES[0], end: ENTRIES[0].end + 6e4 }, ENTRIES[1], nap('local', 0, 9, 0, 9, 30)];
  const incoming = imp(exp()).data.entries;
  const p = planImport(existing, incoming, 'merge');
  assert.deepEqual(p.put.map((e) => e.id).sort(), ['a2', 'a3', 'g2']);
  assert.deepEqual(p.del, []);
  assert.equal(p.added, 3);
  assert.equal(p.kept, 2);
  assert.equal(p.removed, 0);
  assert.equal(p.result.length, 6);
  assert.equal(p.result.find((e) => e.id === 'g1').end, ENTRIES[0].end + 6e4, 'existing entry wins');
  assert.ok(p.result.some((e) => e.id === 'local'));
  // merging the same file twice adds nothing
  assert.equal(planImport(p.result, incoming, 'merge').put.length, 0);
});

test('replace: the log becomes exactly the file', () => {
  const existing = [ENTRIES[0], nap('local', 0, 9, 0, 9, 30), nap('local2', 0, 11, 0, 11, 30)];
  const incoming = imp(exp()).data.entries;
  const p = planImport(existing, incoming, 'replace');
  assert.deepEqual(p.del.sort(), ['local', 'local2']);
  assert.equal(p.put.length, 5);
  assert.equal(p.removed, 2);
  assert.equal(p.added, 4);
  assert.deepEqual(
    p.result.map((e) => e.id),
    incoming.map((e) => e.id),
  );
  // replacing with an empty export clears everything
  const empty = planImport(existing, [], 'replace');
  assert.equal(empty.del.length, 3);
  assert.equal(empty.result.length, 0);
});

test('summarize counts naps and nights', () => {
  assert.deepEqual(summarize([]), { count: 0, naps: 0, nights: 0, first: null, last: null });
});

test('okE and okS still behave as before', () => {
  assert.ok(okE({ id: 'abc-1', type: 'nap', start: 1, end: null }));
  assert.ok(!okE({ id: 'a b', type: 'nap', start: 1 }));
  assert.deepEqual(okS({ targetNaps: '3', bedtime: '20:00' }), { targetNaps: 3, bedtime: '20:00' });
  assert.deepEqual(okS(null), { targetNaps: 4, bedtime: '19:30' });
});
