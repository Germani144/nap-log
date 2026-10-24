// Replays a logged history through the real plan maths and reports how far off the predictions were.
// Each day is predicted only from the days before it. The history file holds personal data: keep it out of the repo.
// Run: TZ=Europe/Copenhagen node tools/backtest.mjs path/to/entries.json
// The file is a JSON array of entries: {id, type: 'nap' | 'night', start, end} (ms timestamps).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { makePlan, startOfDay, minuteOfDay } = createRequire(import.meta.url)('../plan.js');
const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/backtest.mjs entries.json');
  process.exit(1);
}
const E = JSON.parse(fs.readFileSync(file, 'utf8'));
const days = [...new Set(E.filter((e) => e.type === 'nap').map((e) => startOfDay(e.start)))]
  .sort((a, b) => a - b)
  .slice(7);
const errN = [],
  errB = [],
  midN = [],
  midB = [];
for (const day of days) {
  const naps = E.filter((e) => e.type === 'nap' && startOfDay(e.start) === day).sort((a, b) => a.start - b.start);
  const bed = E.find((e) => e.type === 'night' && startOfDay(e.start) === day);
  if (naps.length < 3 || !bed) continue;
  for (const k of [0, 1, naps.length - 1]) {
    // predict right after nap k ended
    const now = naps[k].end + 6e4,
      seen = E.filter((e) => e.start < now && e.start >= now - 14 * 864e5).map((e) =>
        e.end && e.end > now ? { ...e, end: null } : e,
      );
    const p = makePlan(seen, now, { targetNaps: naps.length >= 4 ? 4 : 3, bedtime: '19:30' });
    if (!p.next) continue;
    if (p.next.label === 'Bedtime') errB.push(Math.abs(p.next.t - minuteOfDay(bed.start)));
    else if (naps[k + 1]) errN.push(Math.abs(p.next.t - minuteOfDay(naps[k + 1].start)));
  }
  // in the middle of a nap: 30 min after it started, how well are the next nap and bedtime predicted?
  naps.forEach((nap, k) => {
    if (nap.end - nap.start <= 30 * 6e4) return;
    const now = nap.start + 30 * 6e4,
      seen = E.filter((e) => e.start < now && e.start >= now - 14 * 864e5).map((e) =>
        e.end && e.end > now ? { ...e, end: null } : e,
      );
    const p = makePlan(seen, now, { targetNaps: naps.length >= 4 ? 4 : 3, bedtime: '19:30' });
    if (k === naps.length - 1) {
      if (p.B != null) midB.push(Math.abs(p.B - minuteOfDay(bed.start)));
    } else {
      const r = p.rows[k + 1];
      if (r && !r.nodata && r.s != null) midN.push(Math.abs(r.s - minuteOfDay(naps[k + 1].start)));
    }
  });
}
const mae = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`next nap: off by ${mae(errN)} min on average (${errN.length} predictions)`);
console.log(`bedtime:  off by ${mae(errB)} min on average (${errB.length} predictions)`);
console.log(
  `during a nap (30 min in), next nap: off by ${mae(midN)} min (${midN.length}); bedtime: off by ${mae(midB)} min (${midB.length})`,
);
