// Tests for js/core.js: the small pure functions the app files share. Run: TZ=Europe/Copenhagen node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../js/core.js');
const {
  escapeHtml,
  tapAction,
  timeOnDay,
  parseTypedTime,
  extraNapsFrom,
  reminderUpdate,
  base64UrlToBytes,
  deviceName,
  versionInSw,
} = core;

const MIN = 6e4;

test('escapeHtml escapes everything that could become markup', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="a('b')">&`),
    '&#60;img src=x onerror=&#34;a(&#39;b&#39;)&#34;&#62;&#38;',
  );
  assert.equal(escapeHtml(42), '42');
});

test('tapAction builds escaped data attributes', () => {
  assert.equal(tapAction('log-wake'), ' data-act="log-wake"');
  assert.equal(tapAction('edit', { id: 'abc-1' }), ' data-act="edit" data-id="abc-1"');
  assert.equal(
    tapAction('add', { type: 'nap', day: 1760392800000 }),
    ' data-act="add" data-type="nap" data-day="1760392800000"',
  );
  assert.equal(tapAction('edit', { id: '"><b>' }), ' data-act="edit" data-id="&#34;&#62;&#60;b&#62;"');
});

test('parseTypedTime: what the numeric keypad gives', () => {
  const cases = {
    '': '',
    '  ': '',
    9: '09:00',
    '07': '07:00',
    730: '07:30',
    1437: '14:37',
    '14:37': '14:37',
    '7:5': '07:05',
    '23:59': '23:59',
    '0000': '00:00',
    '14:3': '14:03',
    '9:': '09:00',
    ' 8.15 ': '08:15',
    2400: null,
    1260: null,
    99: null,
    ab: null,
    '25:00': null,
  };
  for (const [typed, want] of Object.entries(cases)) assert.equal(parseTypedTime(typed), want, JSON.stringify(typed));
  assert.equal(parseTypedTime(null), '');
});

test('timeOnDay puts a typed time on a day, also on daylight-saving days', () => {
  const day = new Date(2026, 9, 14).getTime();
  assert.equal(timeOnDay(day, '07:30'), new Date(2026, 9, 14, 7, 30).getTime());
  const dst = new Date(2026, 9, 25).getTime(); // clocks go back at 03:00
  assert.equal(timeOnDay(dst, '19:30'), new Date(2026, 9, 25, 19, 30).getTime());
});

test('extraNapsFrom: only today counts, between 0 and 3', () => {
  assert.equal(extraNapsFrom(null, '2026-10-14'), 0);
  assert.equal(extraNapsFrom({ day: '2026-10-14', n: 1 }, '2026-10-14'), 1);
  assert.equal(extraNapsFrom({ day: '2026-10-13', n: 2 }, '2026-10-14'), 0);
  assert.equal(extraNapsFrom({ day: '2026-10-14', n: 9 }, '2026-10-14'), 3);
  assert.equal(extraNapsFrom({ day: '2026-10-14', n: -2 }, '2026-10-14'), 0);
  assert.equal(extraNapsFrom({ day: '2026-10-14', n: 'x' }, '2026-10-14'), 0);
  assert.equal(extraNapsFrom({ day: '2026-10-14', n: '2' }, '2026-10-14'), 2);
});

test('reminderUpdate: plans, moves and cancels the reminder', () => {
  const now = new Date(2026, 9, 14, 8, 0).getTime();
  const want = (key, eventMin) => ({
    key,
    at: now + (eventMin - 30) * MIN,
    event: now + eventMin * MIN,
    label: 'Nap 1',
    time: '09:00',
  });
  const full = (w) => ({
    notifyAt: w.at,
    notifyEvent: w.event,
    notifyKey: w.key,
    notifyLabel: w.label,
    notifyTime: w.time,
    notifyText: '',
  });
  const w = want('nap1-2026-10-14', 60);
  // a new event, more than 30 minutes away: planned
  assert.deepEqual(reminderUpdate(w, {}, now), full(w));
  // the same event already planned at that time: nothing to write
  assert.equal(reminderUpdate(w, full(w), now), null);
  // the same event, moved by less than 5 minutes: left alone; by 5 or more: re-planned
  assert.equal(reminderUpdate(want(w.key, 63), full(w), now), null);
  const moved = want(w.key, 70);
  assert.deepEqual(reminderUpdate(moved, full(w), now), full(moved));
  // already sent: never planned again
  assert.equal(reminderUpdate(moved, { ...full(w), notifySent: w.key }, now), null);
  // a new event less than 30 minutes away: the pending one is cancelled, nothing new is planned
  assert.deepEqual(reminderUpdate(want('bed-2026-10-14', 20), full(w), now), { notifyAt: 0 });
  assert.equal(reminderUpdate(want('bed-2026-10-14', 20), {}, now), null);
  // nothing to remind about (asleep, bedtime logged): cancel what is waiting, if anything
  assert.deepEqual(reminderUpdate(null, full(w), now), { notifyAt: 0 });
  assert.equal(reminderUpdate(null, {}, now), null);
  assert.equal(reminderUpdate(null, { ...full(w), notifySent: w.key }, now), null);
  // a test notification waiting for the sender is never overwritten (for 30 minutes)
  const testDoc = { notifyKey: 'test-1', notifyAt: now - 10 * MIN, notifyEvent: 0 };
  assert.equal(reminderUpdate(w, testDoc, now), null);
  assert.deepEqual(reminderUpdate(w, { ...testDoc, notifyAt: now - 31 * MIN }, now), full(w));
});

test('base64UrlToBytes decodes the VAPID key format', () => {
  assert.deepEqual([...base64UrlToBytes('AQID')], [1, 2, 3]);
  assert.deepEqual([...base64UrlToBytes('_-8')], [255, 239]); // url-safe letters, no padding
  const vapid = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8').match(
    /VAPID_PUBLIC =\s*'([^']+)'/,
  )[1];
  assert.equal(base64UrlToBytes(vapid).length, 65); // an uncompressed P-256 public key
});

test('deviceName', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'iPhone');
  assert.equal(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 7)'), 'Android');
  assert.equal(deviceName('Mozilla/5.0 (X11; Linux x86_64)'), 'other');
});

test('versionInSw reads the cache name, also from the real sw.js', () => {
  assert.equal(versionInSw("const P='nap-log-',C=P+'v3.14';"), '3.14');
  assert.equal(
    versionInSw("const P = 'nap-log-', C = P + 'v3.14';"),
    null,
    'a reformatted line is not read: keep the shape',
  );
  assert.equal(versionInSw(''), null);
  assert.match(versionInSw(readFileSync(new URL('../sw.js', import.meta.url), 'utf8')), /^\d+\.\d+$/);
});

test('withoutDuplicates: the same nap or night logged twice counts once', () => {
  const { withoutDuplicates } = core;
  const a = { id: 'imp-1', type: 'night', start: 1000, end: 5000 };
  const b = { id: 'app-1', type: 'night', start: 1000, end: 5000 };
  const c = { id: 'app-2', type: 'nap', start: 1000, end: 5000 }; // same times, other type: kept
  const d = { id: 'app-3', type: 'night', start: 1000, end: 6000 }; // other end: kept
  assert.deepEqual(withoutDuplicates([a, b, c, d]), [a, c, d]);
  const withPred = { ...b, pred: { s: 900, len: 60 } };
  assert.deepEqual(withoutDuplicates([a, withPred]), [withPred], 'the copy with a saved prediction is kept');
  const running = { id: 'r', type: 'nap', start: 7000, end: null };
  assert.deepEqual(withoutDuplicates([running, { ...running, id: 'r2' }]), [running]);
  assert.deepEqual(withoutDuplicates([]), []);
});

test('configAppliesHere: settings are used only at their own address (and locally for tests)', () => {
  const { configAppliesHere } = core;
  const mine = 'https://germani144.github.io/nap-log/';
  assert.equal(configAppliesHere(mine, 'https://germani144.github.io'), true);
  assert.equal(configAppliesHere(mine, 'https://a-friend.github.io'), false, 'a copy at another address');
  assert.equal(configAppliesHere(mine, 'http://127.0.0.1:8080'), true);
  assert.equal(configAppliesHere(mine, 'http://localhost:3000'), true);
  assert.equal(configAppliesHere(null, 'https://germani144.github.io'), false);
  assert.equal(configAppliesHere('not an address', 'https://germani144.github.io'), false);
});

test('canResume: only the most recent entry, and only while nothing is running', () => {
  const { canResume } = core;
  const night = { id: 'n', type: 'night', start: 100, end: 500 },
    nap1 = { id: 'a', type: 'nap', start: 600, end: 700 },
    nap2 = { id: 'b', type: 'nap', start: 800, end: 900 };
  assert.equal(canResume([night], 'n'), true, 'woke up, fell asleep again');
  assert.equal(canResume([nap2, night, nap1], 'b'), true, 'in any order');
  assert.equal(canResume([night, nap1, nap2], 'a'), false, 'not an earlier nap');
  assert.equal(canResume([night, nap1, nap2], 'n'), false, 'not the night once a nap is logged');
  assert.equal(canResume([night, nap1, { ...nap2, end: null }], 'a'), false, 'not while one is running');
  assert.equal(canResume([night, { ...nap1, end: null }], 'a'), false, 'not the running one itself');
  assert.equal(canResume([], 'a'), false);
});

test('planVsReal: the saved prediction next to what happened', () => {
  const { planVsReal } = core;
  const t = new Date(2026, 9, 14, 8, 30).getTime();
  const nap = { type: 'nap', start: t - 8 * MIN, end: t + 55 * MIN, pred: { s: t, len: 62, n: 1 } };
  assert.deepEqual(planVsReal(nap), { start: t, end: t + 62 * MIN, len: 62, startOff: -8, lenOff: 1 });
  assert.equal(planVsReal({ ...nap, end: null }).lenOff, null, 'still running');
  // a night: the expected wake-up is its real bedtime plus the expected night length
  const bed = new Date(2026, 9, 14, 19, 36).getTime();
  const night = { type: 'night', start: bed, end: bed + 640 * MIN, pred: { s: bed - 6 * MIN, len: 660 } };
  assert.deepEqual(planVsReal(night), {
    start: bed - 6 * MIN,
    end: bed + 660 * MIN,
    len: 660,
    startOff: 6,
    lenOff: -20,
  });
  assert.equal(planVsReal({ ...nap, pred: undefined }), null, 'no saved prediction');
  assert.equal(planVsReal({ ...nap, pred: { s: 0, len: 60 } }), null);
  assert.equal(planVsReal(null), null);
});
