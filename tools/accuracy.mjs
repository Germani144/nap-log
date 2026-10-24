// Real-world accuracy of each app version, from the predictions saved when a nap or night was started (`pred`).
// Unlike tools/backtest.mjs this uses what the app actually predicted at the time, with the settings of that day.
// The history file holds personal data: keep it out of the repo.
// Run: TZ=Europe/Copenhagen node tools/accuracy.mjs path/to/entries.json
import fs from 'node:fs';
const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/accuracy.mjs entries.json');
  process.exit(1);
}
const E = JSON.parse(fs.readFileSync(file, 'utf8')).filter((e) => e.pred && e.end);
if (!E.length) {
  console.log(
    'No finished entries with saved predictions yet (they are saved from v2.15 on, for button and hand-filled entries alike).',
  );
  process.exit(0);
}
const groups = {};
for (const e of E) (groups[`v${e.pred.v} ${e.type}`] ??= []).push(e);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length,
  f = (x) => x.toFixed(0);
for (const [k, l] of Object.entries(groups).sort()) {
  const ds = l.map((e) => (e.start - e.pred.s) / 6e4),
    dl = l.map((e) => (e.end - e.start) / 6e4 - e.pred.len);
  const early = ds.filter((d) => d < -5).length,
    late = ds.filter((d) => d > 5).length;
  console.log(`${k}: ${l.length} entries`);
  console.log(
    `  start: off by ${f(mean(ds.map(Math.abs)))} min on average; ${early} started >5 min early, ${late} >5 min late, ${l.length - early - late} within 5 min`,
  );
  console.log(
    `  length: off by ${f(mean(dl.map(Math.abs)))} min on average (${mean(dl) >= 0 ? '+' : ''}${f(mean(dl))} min longer than predicted on average)`,
  );
}
