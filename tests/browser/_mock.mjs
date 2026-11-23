import { startServer, openPhone, at, madeUpHistory, closeBrowser } from './harness.mjs';
const D0 = new Date(2026, 9, 14).getTime(),
  S3 = { targetNaps: 3, bedtime: '19:30' };
const srv = await startServer();
const p = await openPhone(srv.base, {
  now: at(D0, 0, 12, 0),
  storage: { entries: madeUpHistory(D0, 21), settings: S3 },
});
const pg = p.page;
await pg.click('#t-stats');
await pg.waitForTimeout(500);
await pg.locator('#stats button', { hasText: '14 days' }).click();
await pg.waitForTimeout(400);
const info = await pg.evaluate(() => {
  const secs = [...document.querySelectorAll('#stats .chart')];
  const first = secs.map((s) => chartData[s.dataset.k]).find(Boolean);
  const day = first.geo.days[first.geo.n - 5].day;
  const out = [];
  for (const sec of secs) {
    const c = chartData[sec.dataset.k];
    if (!c) continue;
    const G = c.geo,
      i = G.days.findIndex((d) => d.day === day);
    if (i < 0) {
      out.push(sec.dataset.k + ': no such day');
      continue;
    }
    const svg = sec.querySelector('svg'),
      r = svg.getBoundingClientRect();
    const x = G.bars ? G.L + (i + 0.5) * (G.pw / G.n) : G.X(i);
    svg.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: r.left + (x / G.W) * r.width,
        clientY: r.top + r.height / 2,
      }),
    );
    out.push(sec.dataset.k);
  }
  return out;
});
console.log(info);
await pg.screenshot({ path: '/home/claude/work/sync-full.png', fullPage: true });
await p.close();
await closeBrowser();
srv.server.close();
