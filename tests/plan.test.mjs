// Tests for the plan maths. Run: TZ=Europe/Copenhagen node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { makePlan, clockTime } = createRequire(import.meta.url)('../plan.js');

const T0 = new Date(2026, 9, 15).getTime(); // "today" = 15 Oct 2026, local midnight
const at = (day, h, m) => T0 + day * 864e5 + (h * 60 + m) * 6e4; // day 0 = today, -1 = yesterday
let n = 0;
const nap = (d, h1, m1, h2, m2) => ({
  id: 'n' + n++,
  type: 'nap',
  start: at(d, h1, m1),
  end: h2 == null ? null : at(d, h2, m2),
});
const night = (d, h1, m1, h2, m2) => ({
  id: 'g' + n++,
  type: 'night',
  start: at(d, h1, m1),
  end: h2 == null ? null : at(d + 1, h2, m2),
});
const S = { targetNaps: 3, bedtime: '19:30' };
// a regular week: wake 06:30, naps 08:30-09:30, 12:00-13:30, 16:00-16:45, bed 19:30
function week(days = 7) {
  const E = [];
  for (let d = -days; d < 0; d++)
    E.push(night(d - 1, 19, 30, 6, 30), nap(d, 8, 30, 9, 30), nap(d, 12, 0, 13, 30), nap(d, 16, 0, 16, 45));
  E.push(night(-1, 19, 30, 6, 30));
  return E;
}
const starts = (p) => p.rows.filter((r) => !r.nodata).map((r) => clockTime(r.s));

test('no history: naps say "no data", nothing to notify', () => {
  const p = makePlan([], at(0, 9, 0), S);
  assert.equal(p.rows.length, 3);
  assert.ok(p.rows.every((r) => r.nodata));
  assert.equal(p.next, null);
  assert.equal(p.want, null);
  assert.equal(p.T, null);
});

test('a regular week reproduces the usual day', () => {
  const p = makePlan(week(), at(0, 7, 0), S);
  assert.deepEqual(starts(p), ['08:30', '12:00', '16:00']);
  assert.equal(clockTime(p.B), '19:30');
  assert.equal(p.next.label, 'Next nap');
  assert.equal(clockTime(p.next.t), '08:30');
  assert.equal(p.want.at, at(0, 8, 0)); // notification 30 min before
});

test('a late wake-up moves the naps after it (awake windows, not clock times)', () => {
  const E = week();
  E[E.length - 1] = night(-1, 19, 30, 7, 30); // woke an hour late
  assert.deepEqual(starts(makePlan(E, at(0, 8, 0), S)).slice(0, 2), ['09:30', '13:00']);
});

test('a long nap pushes the next one later', () => {
  const E = [...week(), nap(0, 8, 30, 10, 30)]; // nap 1 an hour longer than usual
  assert.equal(starts(makePlan(E, at(0, 10, 40), S))[1], '13:00');
});

test('awake windows never exceed 3h 30m', () => {
  const E = [];
  for (let d = -7; d < 0; d++) E.push(night(d - 1, 19, 30, 6, 0), nap(d, 11, 0, 12, 0));
  E.push(night(-1, 19, 30, 6, 0));
  const p = makePlan(E, at(0, 7, 0), { targetNaps: 1, bedtime: '19:30' });
  assert.equal(clockTime(p.rows[0].s), '09:30'); // usual 5h gap capped to 3h30
});

test('bedtime stays within 30 minutes of the target when the naps allow it', () => {
  for (const bt of ['18:30', '19:30', '20:30']) {
    const p = makePlan(week(), at(0, 7, 0), { targetNaps: 3, bedtime: bt });
    const [h, m] = bt.split(':').map(Number);
    assert.ok(Math.abs(p.B - (h * 60 + m)) <= 30, bt + ' -> ' + clockTime(p.B));
  }
});

test('short naps today lengthen the remaining ones, never beyond 3 hours', () => {
  const E = [...week(), nap(0, 8, 30, 8, 50), nap(0, 11, 0, 11, 20)];
  const r = makePlan(E, at(0, 11, 30), S).rows[2];
  assert.ok(r.add > 0);
  assert.ok(r.e - r.s <= 180);
});

test('recent days count more', () => {
  const E = week();
  E.splice(
    E.findIndex((e) => e.type === 'nap' && e.start === at(-1, 8, 30)),
    1,
    nap(-1, 7, 30, 8, 30),
  ); // yesterday nap 1 an hour earlier
  const s = makePlan(E, at(0, 7, 0), S).rows[0].s;
  assert.ok(s < 8 * 60 + 30 - 60 / 7, 'weighted more than a plain 1-in-7 average: ' + clockTime(s));
});

test('while asleep there is no next event to notify about', () => {
  const p = makePlan([...week(), nap(0, 8, 30, null)], at(0, 9, 0), S);
  assert.equal(p.run.type, 'nap');
  assert.equal(p.next, null);
  assert.equal(p.want, null);
});

test('night ring: expected length is the average of the last 8 nights, or 10h 30m without data', () => {
  const p = makePlan([...week(), night(0, 19, 30, null)], at(0, 22, 0), S);
  assert.equal(Math.round(p.avgN), 660); // 19:30 -> 06:30
  assert.equal(makePlan([night(0, 19, 30, null)], at(0, 22, 0), S).avgN, 630);
});

test('the result only depends on the inputs', () => {
  const E = week(),
    a = JSON.stringify(makePlan(E, at(0, 10, 0), S)),
    b = JSON.stringify(makePlan(E, at(0, 10, 0), S));
  assert.equal(a, b);
});

test('predFor: what a starting nap or night was predicted to be', async () => {
  const { predFor } = createRequire(import.meta.url)('../plan.js');
  const p = makePlan(week(), at(0, 8, 25), S);
  assert.deepEqual(predFor(p, 'nap'), { s: at(0, 8, 30), len: 60, n: 1 });
  const q = makePlan([...week(), nap(0, 8, 30, 9, 30), nap(0, 12, 0, 13, 30), nap(0, 16, 0, 16, 45)], at(0, 19, 20), S);
  const pn = predFor(q, 'night');
  assert.equal(pn.len, 660);
  assert.ok(Math.abs(pn.s - at(0, 19, 30)) <= 30 * 6e4);
  assert.equal(predFor(makePlan([], at(0, 9, 0), S), 'nap'), null); // no data, no prediction
});

test('nap in progress: target = day goal − naps done − usual later naps, kept between 20 min and 3 h', () => {
  // usual day: 1h + 1h30 + 45m = 3h15 of naps
  const long = makePlan(
    [...week(), nap(0, 8, 30, 10, 30), nap(0, 12, 0, 14, 0), nap(0, 16, 0, null)],
    at(0, 16, 10),
    S,
  );
  assert.equal(Math.round(long.cur.len), 20); // 4h done already: only a short catnap left
  const short = makePlan(
    [...week(), nap(0, 8, 30, 9, 0), nap(0, 12, 0, 12, 30), nap(0, 16, 0, null)],
    at(0, 16, 10),
    S,
  );
  assert.equal(Math.round(short.cur.len), 135); // 1h done: this nap catches up (3h15 − 1h)
  const first = makePlan([...week(), nap(0, 8, 30, null)], at(0, 8, 40), S);
  assert.equal(Math.round(first.cur.len), 60); // on a normal day it is the usual length
  assert.equal(makePlan([nap(0, 8, 30, null)], at(0, 8, 40), S).cur, null); // no data, no target
});

test('past the target the plan counts from now', () => {
  const p = makePlan([...week(), nap(0, 8, 30, 10, 30), nap(0, 12, 0, 14, 0), nap(0, 16, 0, null)], at(0, 17, 0), S);
  assert.equal(p.rows[2].e, 17 * 60);
});

test('predBefore: an entry filled in later gets the same prediction as one started live', async () => {
  const { predBefore, predFor } = createRequire(import.meta.url)('../plan.js');
  const live = predFor(makePlan(week(), at(0, 8, 40), S), 'nap'); // Start pressed at 08:40
  const later = [...week(), nap(0, 8, 40, 9, 40), nap(0, 12, 5, null)]; // filled in at 12:30, with a later nap logged too
  const e = later.find((x) => x.start === at(0, 8, 40));
  assert.deepEqual(predBefore(later, e, S), live);
});

test('a nap number with no data is planned like a bridge nap, so bedtime is still estimated', () => {
  const p = makePlan(week(), at(0, 7, 0), { targetNaps: 4, bedtime: '19:30' });
  const r4 = p.rows[3];
  assert.ok(!r4.nodata);
  assert.equal(r4.from, 3);
  assert.notEqual(p.B, null);
  assert.ok(r4.e - r4.s <= 45);
  assert.ok(Math.abs(p.B - (19 * 60 + 30)) <= 30); // short, and bedtime stays near its target
});

test('catch-up stretches a nap to at most 1.5× its usual length; the rest may become an extra nap', () => {
  // two very short naps: the usual 45m nap 3 can only grow to ~68m
  const p = makePlan([...week(), nap(0, 8, 30, 8, 50), nap(0, 12, 0, 12, 20)], at(0, 12, 30), S);
  const r3 = p.rows[2];
  assert.ok(r3.e - r3.s <= 45 * 1.5 + 0.5, 'nap 3 is ' + (r3.e - r3.s));
  const x = p.rows.find((r) => r.extra);
  if (x) {
    assert.ok(x.e - x.s >= 30 && x.e - x.s <= 45);
    assert.ok(x.s > p.rows[2].e);
  }
});

test('no extra nap on a normal day', () => {
  assert.equal(
    makePlan(week(), at(0, 7, 0), S).rows.some((r) => r.extra),
    false,
  );
});

test("extraNaps adds a nap to today's plan and the remaining naps are re-sized", () => {
  const E = [...week(), nap(0, 8, 30, 8, 50), nap(0, 12, 0, 12, 20)],
    t = at(0, 12, 30);
  const base = makePlan(E, t, S),
    more = makePlan(E, t, { ...S, extraNaps: 1 });
  assert.equal(more.rows.filter((r) => !r.a && !r.extra).length, base.rows.filter((r) => !r.a && !r.extra).length + 1);
  assert.ok(more.rows[2].e - more.rows[2].s <= base.rows[2].e - base.rows[2].s); // nap 3 is not longer (here both hit the 1.5x cap)
  const E2 = [...week(), nap(0, 8, 30, 9, 20), nap(0, 12, 0, 13, 10)],
    a2 = makePlan(E2, at(0, 13, 20), S),
    b2 = makePlan(E2, at(0, 13, 20), { ...S, extraNaps: 1 });
  assert.ok(b2.rows[2].e - b2.rows[2].s < a2.rows[2].e - a2.rows[2].s); // below the cap, nap 3 gets shorter
});

test('with an added nap, the awake windows shrink so the next nap also comes earlier', () => {
  const E = [...week(), nap(0, 8, 30, 8, 50), nap(0, 12, 0, 12, 20)],
    t = at(0, 12, 30);
  const three = makePlan(E, t, S),
    four = makePlan(E, t, { ...S, extraNaps: 1 });
  assert.ok(
    four.rows[2].s < three.rows[2].s,
    'nap 3 at ' + clockTime(four.rows[2].s) + ' vs ' + clockTime(three.rows[2].s),
  );
  const w = [four.rows[2].s - four.rows[1].e, four.rows[3].s - four.rows[2].e, four.B - four.rows[3].e];
  assert.ok(Math.max(...w) - Math.min(...w) <= 1, 'windows ' + w.map(Math.round)); // evenly spread
});

test('a 4th nap in progress beyond her usual naps is a bridge nap: target at most 45 min', () => {
  const E = [...week(), nap(0, 8, 30, 8, 50), nap(0, 12, 0, 12, 20), nap(0, 14, 30, 15, 10), nap(0, 17, 0, null)];
  const p = makePlan(E, at(0, 17, 10), { ...S, extraNaps: 1 });
  assert.ok(p.cur.len <= 45, 'target ' + p.cur.len);
  assert.ok(p.B <= 19 * 60 + 45, 'bedtime ' + clockTime(p.B)); // no late bedtime after a bridge nap
});

test('an added nap is a bridge nap even when there is data for that nap number', () => {
  // a week with 4 naps a day, target set to 3, a 4th nap in progress late in the afternoon
  const W = [];
  for (let d = -7; d < 0; d++)
    W.push(
      night(d - 1, 19, 30, 6, 30),
      nap(d, 8, 30, 9, 30),
      nap(d, 12, 0, 13, 0),
      nap(d, 15, 0, 16, 0),
      nap(d, 17, 0, 17, 40),
    );
  W.push(night(-1, 19, 30, 6, 30));
  const p = makePlan(
    [...W, nap(0, 8, 30, 8, 50), nap(0, 12, 0, 12, 20), nap(0, 15, 0, 15, 30), nap(0, 17, 0, null)],
    at(0, 17, 10),
    { ...S, extraNaps: 1 },
  );
  assert.ok(p.cur.len <= 45, 'target ' + p.cur.len);
  assert.ok(p.B <= 19 * 60 + 45, 'bedtime ' + clockTime(p.B));
});

test('dailyStats: per-day wake-up, naps, bedtime, night length and awake time', async () => {
  const { dailyStats } = createRequire(import.meta.url)('../plan.js');
  const st = dailyStats(week(), T0, 7),
    d = st[st.length - 1]; // yesterday
  assert.equal(st.length, 7);
  assert.equal(d.wake, 6 * 60 + 30);
  assert.equal(d.bed, 19 * 60 + 30);
  assert.deepEqual(
    d.naps.map((n) => n.len),
    [60, 90, 45],
  );
  assert.equal(d.napSum, 195);
  assert.equal(d.night, 11 * 60);
  assert.equal(d.awake, 13 * 60 - 195);
  assert.equal(
    dailyStats([], T0, 3).every((x) => x.wake == null && x.napSum == null),
    true,
  );
});

test('a suggested extra nap is not counted until added: countdown to bedtime, bedtime planned without it', () => {
  // like 18 Oct: up 05:57, three naps done by 15:35 with ~35 min of nap time still missing
  const E = [
      ...week().slice(0, -1),
      night(-1, 19, 30, 5, 57),
      nap(0, 7, 58, 8, 41),
      nap(0, 10, 57, 12, 19),
      nap(0, 15, 0, 15, 35),
    ],
    t = at(0, 16, 8);
  const p = makePlan(E, t, S),
    x = p.rows.find((r) => r.extra);
  assert.ok(x, 'an extra nap is suggested');
  assert.equal(p.next.label, 'Bedtime');
  assert.equal(p.next.t, p.B);
  assert.ok(p.B <= 15 * 60 + 35 + 210, 'bedtime respects the 3h 30m awake limit: ' + clockTime(p.B)); // no nap after 15:35
  const q = makePlan(E, t, { ...S, extraNaps: 1 }); // once added
  assert.equal(q.next.label, 'Next nap');
  assert.ok(q.B > p.B, 'bedtime moves later with the added nap');
});

test('nap in progress: earlier naps get their usual length; the last one is long enough to keep the stretch to bed near usual', () => {
  // like 19 Oct: up 05:13, two long naps already past the day's nap-time target, nap 3 started 15:42
  const E = [
    ...week().slice(0, -1),
    night(-1, 19, 30, 5, 13),
    nap(0, 7, 10, 8, 52),
    nap(0, 11, 33, 13, 6),
    nap(0, 15, 42, null),
  ];
  const p = makePlan(E, at(0, 15, 54), S);
  assert.ok(p.cur.len > 20, 'not cut to the 20-min minimum: ' + p.cur.len);
  assert.ok(19 * 60 + 30 - p.cur.end <= 165 + 35 + 0.5, 'stretch to bedtime at most the usual gap + 35 min'); // usual gap in week(): 16:45-19:30
  const q = makePlan([...week(), nap(0, 8, 30, null)], at(0, 8, 40), S); // a first nap: its usual length
  assert.equal(Math.round(q.cur.len), 60);
});
