// Days when the clocks change (Denmark: last Sunday of March 02:00 -> 03:00, last Sunday of October 03:00 -> 02:00) are
// 23 or 25 hours long. Times on those days must still be the times on the clock. Run with TZ=Europe/Copenhagen.
// All data is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { makePlan, predBefore, addDays, timeAtMinute, clockTime, startOfDay } = createRequire(import.meta.url)(
  '../plan.js',
);

const AUTUMN = new Date(2026, 9, 25).getTime(); // Sun 25 Oct 2026, 25 hours
const SPRING = new Date(2026, 2, 29).getTime(); // Sun 29 Mar 2026, 23 hours
const H = 36e5;
const local = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const S3 = { targetNaps: 3, bedtime: '19:30' };
// `days` regular made-up days before day0 (calendar days, so clock changes inside the week are handled)
function week(day0, days = 7, { lastNight = true } = {}) {
  const E = [];
  const at = (d, h, m) =>
    new Date(new Date(day0).getFullYear(), new Date(day0).getMonth(), new Date(day0).getDate() + d, h, m).getTime();
  for (let d = -days; d < 0; d++)
    E.push(
      { id: 'n' + d, type: 'night', start: at(d - 1, 19, 30), end: at(d, 6, 30) },
      { id: 'a' + d, type: 'nap', start: at(d, 8, 30), end: at(d, 9, 30) },
      { id: 'b' + d, type: 'nap', start: at(d, 12, 0), end: at(d, 13, 20) },
      { id: 'c' + d, type: 'nap', start: at(d, 16, 0), end: at(d, 16, 40) },
    );
  if (lastNight) E.push({ id: 'n0', type: 'night', start: at(-1, 19, 30), end: at(0, 6, 30) });
  return { E, at };
}

test('the test runs in Copenhagen time, where these days really are 25 and 23 hours', () => {
  assert.equal(addDays(AUTUMN, 1) - AUTUMN, 25 * H);
  assert.equal(addDays(SPRING, 1) - SPRING, 23 * H);
});

test('addDays counts calendar days', () => {
  assert.equal(addDays(AUTUMN, 1), new Date(2026, 9, 26).getTime());
  assert.equal(addDays(new Date(2026, 9, 26).getTime(), -7), new Date(2026, 9, 19).getTime());
  assert.equal(addDays(SPRING, -1), new Date(2026, 2, 28).getTime());
  assert.equal(addDays(new Date(2026, 9, 14).getTime(), 3), new Date(2026, 9, 17).getTime());
});

test('timeAtMinute gives the clock time, also after the clocks changed', () => {
  assert.equal(timeAtMinute(AUTUMN, 8 * 60 + 26), new Date(2026, 9, 25, 8, 26).getTime());
  assert.equal(timeAtMinute(SPRING, 8 * 60), new Date(2026, 2, 29, 8, 0).getTime());
  const normal = new Date(2026, 9, 14).getTime();
  assert.equal(timeAtMinute(normal, 19 * 60 + 30), normal + (19 * 60 + 30) * 6e4, 'a normal day is unchanged');
  assert.equal(timeAtMinute(normal, 90.5), normal + 90.5 * 6e4, 'fractions of a minute are kept');
});

for (const [name, day0] of [
  ['autumn', AUTUMN],
  ['spring', SPRING],
]) {
  test(`${name}: the reminder is planned for the time the plan shows`, () => {
    const { E, at } = week(day0);
    const p = makePlan(E, at(0, 7, 0), S3);
    assert.ok(p.want, 'a reminder is planned');
    assert.equal(local(p.want.event), p.want.time, 'event at the shown time');
    assert.equal(local(p.want.at + 30 * 6e4), p.want.time, '30 minutes before it');
    assert.equal(p.want.time, clockTime(p.next.t));
  });

  test(`${name}: the saved prediction is the shown time`, () => {
    const { E, at } = week(day0);
    const nap = { id: 'x', type: 'nap', start: at(0, 8, 40), end: at(0, 9, 30) };
    const pred = predBefore([...E, nap], nap, S3);
    const p = makePlan(E, nap.start - 6e4, S3);
    assert.equal(local(pred.s), clockTime(p.rows.find((r) => !r.a).s));
  });
}

test('the day after a clock change, "the past 7 days" is still 7 days', () => {
  // only one day of history, exactly 7 calendar days back (Mon 19 Oct); the plan is made on Mon 26 Oct
  const monday = new Date(2026, 9, 26).getTime();
  const at = (d, h, m) => new Date(2026, 9, 26 + d, h, m).getTime();
  const E = [
    { id: 'n', type: 'night', start: at(-8, 19, 30), end: at(-7, 6, 30) },
    { id: 'a', type: 'nap', start: at(-7, 8, 30), end: at(-7, 9, 30) },
  ];
  const p = makePlan(E, at(0, 7, 0), { targetNaps: 1, bedtime: '19:30' });
  assert.equal(startOfDay(at(-7, 12, 0)), addDays(monday, -7));
  assert.ok(!p.rows[0].nodata, 'the day 7 days back counts');
  assert.equal(clockTime(p.rows[0].s), '08:30');
});
