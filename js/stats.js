// The Statistics tab: charts of the last 7, 14 or 30 days.

// ---------- statistics tab ----------
// Charts of the last 7/14/30 full days, drawn as inline SVG. Colours were checked for colour-blind separation and
// contrast on the app's dark background (dataviz validator). One scale per chart: night sleep has its own chart.
const CHART_COLORS = {
  n1: '#3987e5',
  n2: '#d95926',
  n3: '#199e70',
  n4: '#c98500',
  bed: '#d55181',
  awake: '#c98500',
  naps: '#199e70',
  night: '#9085e9',
};
let statsDays = (() => {
    try {
      return +lsGet('statsN') || 30;
    } catch {
      return 30;
    }
  })(),
  last30Loaded = false;
function setStatsDays(n) {
  statsDays = n;
  try {
    lsSet('statsN', n);
  } catch {}
  renderStats();
}
// shared mode: the live sync covers 14 days, so the older part of the last 30 days is fetched once
function loadLast30Days() {
  if (!db || last30Loaded) return;
  last30Loaded = true;
  const t = startOfDay(Date.now());
  familyRef()
    .collection('entries')
    .where('start', '>=', t - 32 * DAY)
    .where('start', '<', t - 14 * DAY)
    .get()
    .then((q) => {
      q.docs.forEach((d) => {
        const e = d.data();
        if (isValidEntry(e)) olderEntries[e.id] = e;
      });
      renderStats();
    })
    .catch(() => {
      last30Loaded = false;
    });
}
const shortDate = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const meanOf = (a) => {
  const v = a.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
// a line chart: series [{name, color, vals: one value per day or null}], fmt formats a value
function lineChart(key, title, sub, days, series, fmt, step) {
  const W = 340,
    H = 190,
    L = 44,
    R = 10,
    T = 10,
    B = 24,
    pw = W - L - R,
    ph = H - T - B,
    n = days.length;
  const all = series.flatMap((s) => s.vals).filter((v) => v != null);
  if (!all.length) return chartBox(key, title, sub, '<div class="mu nodata">Not enough data yet for this range.</div>');
  let lo = Math.floor((Math.min(...all) - step * 0.3) / step) * step,
    hi = Math.ceil((Math.max(...all) + step * 0.3) / step) * step;
  if (hi - lo < step * 2) hi = lo + step * 2;
  const X = (i) => L + (n < 2 ? pw / 2 : (i * pw) / (n - 1)),
    Y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
  let g = '';
  const tickStep = Math.max(step, Math.ceil((hi - lo) / step / 5) * step);
  for (let v = lo; v <= hi + 1e-6; v += tickStep)
    g += `<line x1="${L}" x2="${W - R}" y1="${round1(Y(v))}" y2="${round1(Y(v))}" class="grid"/><text x="${L - 6}" y="${round1(Y(v) + 4)}" class="ax" text-anchor="end">${fmt(v)}</text>`;
  const xs = n <= 7 ? days.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  xs.forEach(
    (i) =>
      (g += `<text x="${round1(X(i))}" y="${H - 6}" class="ax" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${shortDate(days[i].day)}</text>`),
  );
  series.forEach((s) => {
    let d = '',
      pen = false;
    s.vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += (pen ? 'L' : 'M') + round1(X(i)) + ' ' + round1(Y(v));
      pen = true;
    });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.vals.forEach((v, i) => {
      if (v != null && s.vals[i - 1] == null && s.vals[i + 1] == null)
        g += `<circle cx="${round1(X(i))}" cy="${round1(Y(v))}" r="3" fill="${s.color}"/>`;
    }); // lone days stay visible
  });
  return chartBox(
    key,
    title,
    sub,
    `<svg viewBox="0 0 ${W} ${H}" class="cs">${g}<g class="hov"></g></svg>`,
    series,
    fmt,
    { X, Y, n, days, L, R, T, B, W, H, pw },
  );
}
// stacked bars per day: [{name,color,vals}] from the bottom up, values in minutes
function barChart(key, title, sub, days, series) {
  const W = 340,
    H = 190,
    L = 44,
    R = 10,
    T = 10,
    B = 24,
    pw = W - L - R,
    ph = H - T - B,
    n = days.length,
    hi = 24 * 60;
  const tot = days.map((_, i) => series.reduce((x, s) => x + (s.vals[i] || 0), 0));
  if (!tot.some((x) => x > 0))
    return chartBox(key, title, sub, '<div class="mu nodata">Not enough data yet for this range.</div>');
  const bw = pw / n,
    Y = (v) => T + ph - (v / hi) * ph,
    X = (i) => L + i * bw + bw / 2;
  let g = '';
  [0, 6, 12, 18, 24].forEach(
    (h) =>
      (g += `<line x1="${L}" x2="${W - R}" y1="${round1(Y(h * 60))}" y2="${round1(Y(h * 60))}" class="grid"/><text x="${L - 6}" y="${round1(Y(h * 60) + 4)}" class="ax" text-anchor="end">${h}h</text>`),
  );
  const xs = n <= 7 ? days.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  xs.forEach(
    (i) =>
      (g += `<text x="${round1(i === 0 ? L : i === n - 1 ? W - R : X(i))}" y="${H - 6}" class="ax" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${shortDate(days[i].day)}</text>`),
  );
  days.forEach((_, i) => {
    if (series.some((s) => s.vals[i] == null)) return; // only complete days are stacked
    let base = 0;
    const w = Math.max(2, bw - 2),
      x = L + i * bw + 1;
    series.forEach((s) => {
      const v = s.vals[i];
      const y1 = Y(base + v),
        y0 = Y(base);
      g += `<rect x="${round1(x)}" y="${round1(y1 + 2)}" width="${round1(w)}" height="${round1(Math.max(0, y0 - y1 - 2))}" rx="${Math.min(2, w / 2)}" fill="${s.color}"/>`;
      base += v;
    });
  });
  return chartBox(
    key,
    title,
    sub,
    `<svg viewBox="0 0 ${W} ${H}" class="cs">${g}<g class="hov"></g></svg>`,
    series,
    (v) => duration(v),
    { X, Y: null, n, days, L, R, T, B, W, H, pw, bars: true },
  );
}
const chartData = {};
function chartBox(key, title, sub, body, series, fmt, geo) {
  if (series) {
    chartData[key] = { series, fmt, geo };
  } else delete chartData[key];
  if (series && series.length === 1) {
    const m = meanOf(series[0].vals);
    if (m != null) sub += ` · average <b>${fmt(m)}</b>`;
  } // one series: no legend box, the title names it
  const leg =
    series && series.length > 1
      ? `<div class="leg2">${series
          .map((s) => {
            const m = meanOf(s.vals);
            return `<span><i style="background:${s.color}"></i>${s.name}${m != null ? ` <b>${fmt(m)}</b>` : ''}</span>`;
          })
          .join('')}</div>`
      : '';
  return `<section class="chart" data-k="${key}"><h2>${title}</h2><div class="csub">${sub}</div>${leg}<div class="cwrap">${body}<div class="tip" hidden></div></div></section>`;
}
// hover / touch: a crosshair on the nearest day and a tooltip with every series' value for that day
function chartHover(ev) {
  const sec = ev.target.closest('.chart');
  if (!sec) return;
  const c = chartData[sec.dataset.k];
  if (!c) return;
  const svg = sec.querySelector('svg'),
    r = svg.getBoundingClientRect(),
    G = c.geo,
    sx = ((ev.clientX - r.left) / r.width) * G.W;
  let i = G.bars ? Math.floor((sx - G.L) / (G.pw / G.n)) : Math.round((sx - G.L) / (G.pw / Math.max(1, G.n - 1)));
  i = Math.max(0, Math.min(G.n - 1, i));
  const x = G.X(i),
    hov = sec.querySelector('.hov');
  let h = `<line x1="${round1(x)}" x2="${round1(x)}" y1="${G.T}" y2="${G.H - G.B}" class="xh"/>`;
  if (G.Y)
    c.series.forEach((s) => {
      const v = s.vals[i];
      if (v != null)
        h += `<circle cx="${round1(x)}" cy="${round1(G.Y(v))}" r="4.5" fill="${s.color}" stroke="#1F2358" stroke-width="2"/>`;
    });
  hov.innerHTML = h;
  const tip = sec.querySelector('.tip');
  tip.innerHTML =
    `<b>${new Date(G.days[i].day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b>` +
    c.series
      .map(
        (s) =>
          `<div><i style="background:${s.color}"></i>${s.name}<span>${s.vals[i] == null ? '–' : c.fmt(s.vals[i])}</span></div>`,
      )
      .join('');
  tip.hidden = false;
  const px = (x / G.W) * r.width;
  tip.style.left = Math.min(Math.max(px - 70, 0), r.width - 150) + 'px';
}
function chartLeave(ev) {
  const sec = ev.target.closest('.chart');
  if (!sec) return;
  sec.querySelector('.hov').innerHTML = '';
  sec.querySelector('.tip').hidden = true;
}
function renderStats() {
  if (currentTab !== 'stats') return;
  const days = dailyStats(allEntries(), startOfDay(Date.now()), statsDays),
    nm = (i) => 'Nap ' + (i + 1);
  const napS = (k) => days.map((d) => (d.naps[k] ? d.naps[k].s : null)),
    napE = (k) => days.map((d) => (d.naps[k] ? d.naps[k].e : null)),
    napL = (k) => days.map((d) => (d.naps[k] ? d.naps[k].len : null));
  const maxN = Math.min(4, Math.max(0, ...days.map((d) => d.naps.length))),
    ks = [...Array(maxN).keys()],
    col = [CHART_COLORS.n1, CHART_COLORS.n2, CHART_COLORS.n3, CHART_COLORS.n4];
  const tfmt = (v) => clockTime(v);
  let h = `<div class="seg">${[7, 14, 30].map((n) => `<button class="${n === statsDays ? 'on' : ''}"${tapAction('stats-range', { n })}>${n} days</button>`).join('')}</div>`;
  h += lineChart(
    'start',
    'When she falls asleep',
    'Start of each nap and bedtime, per day',
    days,
    [
      ...ks.map((k) => ({ name: nm(k), color: col[k], vals: napS(k) })),
      { name: 'Bedtime', color: CHART_COLORS.bed, vals: days.map((d) => d.bed) },
    ],
    tfmt,
    60,
  );
  h += lineChart(
    'wake',
    'When she wakes up',
    'Morning wake-up and the end of each nap, per day',
    days,
    [
      { name: 'Morning', color: CHART_COLORS.bed, vals: days.map((d) => d.wake) },
      ...ks.map((k) => ({ name: nm(k), color: col[k], vals: napE(k) })),
    ],
    tfmt,
    60,
  );
  h += lineChart(
    'len',
    'How long naps last',
    'Length of each nap, per day',
    days,
    ks.map((k) => ({ name: nm(k), color: col[k], vals: napL(k) })),
    (v) => duration(v),
    30,
  );
  h += lineChart(
    'night',
    'Night sleep',
    "From bedtime to the next morning's wake-up",
    days,
    [{ name: 'Night', color: CHART_COLORS.night, vals: days.map((d) => d.night) }],
    (v) => duration(v),
    60,
  );
  h += barChart('day', 'Her day', 'Awake, napping and night sleep, per day (complete days only)', days, [
    { name: 'Night sleep', color: CHART_COLORS.night, vals: days.map((d) => d.night) },
    { name: 'Naps', color: CHART_COLORS.naps, vals: days.map((d) => d.napSum) },
    { name: 'Awake', color: CHART_COLORS.awake, vals: days.map((d) => d.awake) },
  ]);
  h += `<div class="foot">Bold numbers are the averages over the period. Touch a chart to see each day.</div>`;
  const el = $('#stats');
  el.innerHTML = h;
  el.querySelectorAll('.chart svg').forEach((s) => {
    s.addEventListener('pointermove', chartHover);
    s.addEventListener('pointerdown', chartHover);
    s.addEventListener('pointerleave', chartLeave);
  });
}
