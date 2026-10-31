// Replays a logged history through the real plan maths and reports how far off the predictions were.
// Each moment is predicted only from what was logged before it. The history file holds personal data: keep it out of
// the repo (exports and history*.json are git-ignored).
//
// Run: TZ=Europe/Copenhagen node tools/backtest.mjs <file> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--bedtime HH:MM]
//   <file>     the app's export (Settings > Export data) or a JSON array of entries {id, type, start, end}
//   --from/to  only score these days (the days before still count as history)
//   --bedtime  the target bedtime to plan with (default: the export's setting, else 19:30)
// Compare two versions of plan.js by running this before and after a change on the same file and dates.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { makePlan, startOfDay, minuteOfDay } = req('../plan.js');
const { withoutDuplicates } = req('../js/core.js');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
};
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!file) {
  console.error('usage: node tools/backtest.mjs <export.json> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--bedtime HH:MM]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const E = withoutDuplicates((Array.isArray(data) ? data : data.entries).map(({ pred, ...e }) => e)).sort(
  (a, b) => a.start - b.start,
);
const bedtime = opt('bedtime') || (!Array.isArray(data) && data.settings && data.settings.bedtime) || '19:30';
const day = (s) => (s ? new Date(s + 'T00:00:00').getTime() : null);
const from = day(opt('from')),
  to = day(opt('to'));

const days = [...new Set(E.filter((e) => e.type === 'nap').map((e) => startOfDay(e.start)))]
  .sort((a, b) => a - b)
  .slice(7) // the first week only builds up history
  .filter((d) => (from == null || d >= from) && (to == null || d <= to));
const seenAt = (now) =>
  E.filter((e) => e.start < now && e.start >= now - 14 * 864e5).map((e) =>
    e.end && e.end > now ? { ...e, end: null } : e,
  );
const errN = [],
  errB = [],
  midN = [],
  midB = [],
  errLen = [],
  errNight = [];
for (const d of days) {
  const naps = E.filter((e) => e.type === 'nap' && e.end && startOfDay(e.start) === d);
  const bed = E.find((e) => e.type === 'night' && startOfDay(e.start) === d);
  if (naps.length < 3 || !bed) continue;
  const settings = { targetNaps: naps.length >= 4 ? 4 : 3, bedtime };
  for (const k of [0, 1, naps.length - 1]) {
    // predict right after nap k ended
    const now = naps[k].end + 6e4;
    const p = makePlan(seenAt(now), now, settings);
    if (!p.next) continue;
    if (p.next.label === 'Bedtime') errB.push(Math.abs(p.next.t - minuteOfDay(bed.start)));
    else if (naps[k + 1]) errN.push(Math.abs(p.next.t - minuteOfDay(naps[k + 1].start)));
  }
  naps.forEach((nap, k) => {
    // a minute into each nap: its target length (what the app shows while she sleeps) vs how long it really was
    const p0 = makePlan(seenAt(nap.start + 6e4), nap.start + 6e4, settings);
    if (p0.cur) errLen.push(Math.abs(p0.cur.len - (nap.end - nap.start) / 6e4));
    // in the middle of a nap: 30 min after it started, how well are the next nap and bedtime predicted?
    if (nap.end - nap.start <= 30 * 6e4) return;
    const now = nap.start + 30 * 6e4;
    const p = makePlan(seenAt(now), now, settings);
    if (k === naps.length - 1) {
      if (p.B != null) midB.push(Math.abs(p.B - minuteOfDay(bed.start)));
    } else {
      const r = p.rows[k + 1];
      if (r && !r.nodata && r.s != null) midN.push(Math.abs(r.s - minuteOfDay(naps[k + 1].start)));
    }
  });
  // at bedtime: the expected night length vs the real one
  if (bed.end) {
    const p = makePlan(seenAt(bed.start + 6e4), bed.start + 6e4, settings);
    errNight.push(Math.abs(p.avgN - (bed.end - bed.start) / 6e4));
  }
}
const mae = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
console.log(`days scored: ${days.length} · target bedtime ${bedtime}`);
console.log(`next nap: off by ${mae(errN)} min on average (${errN.length} predictions)`);
console.log(`bedtime:  off by ${mae(errB)} min on average (${errB.length} predictions)`);
console.log(
  `during a nap (30 min in), next nap: off by ${mae(midN)} min (${midN.length}); bedtime: off by ${mae(midB)} min (${midB.length})`,
);
console.log(`nap length (target a minute in): off by ${mae(errLen)} min (${errLen.length})`);
console.log(`night length (expected at bedtime): off by ${mae(errNight)} min (${errNight.length})`);
