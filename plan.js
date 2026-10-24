// Nap Log: the plan maths (times, averages, today's suggested naps and bedtime).
// No screen code here: index.html loads this file and draws what makePlan returns,
// and the tests (tests/plan.test.mjs) load it directly in Node.
// All "minutes" are minutes since local midnight; timestamps are milliseconds.
const DAY = 864e5,
  P = (n) => String(n).padStart(2, '0');
const sod = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return +d;
};
const tod = (t) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
const hm = (m) => {
  m = Math.round(m);
  return P(Math.floor(m / 60) % 24) + ':' + P(m % 60);
};
const dur = (m) => {
  m = Math.round(m);
  return m >= 60 ? Math.floor(m / 60) + 'h\u00a0' + P(m % 60) + 'm' : m + 'm';
}; // non-breaking space keeps "3h 30m" on one line
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const isoDay = (t) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + P(d.getMonth() + 1) + '-' + P(d.getDate());
};

// ---------- the plan ----------
// makePlan(entries, now, settings) works out today's plan from the logged history. It is pure: it only uses its
// inputs (never the screen, the clock or globals), so render() just draws what it returns, and tests and
// backtests can call it with any history and any "now".
const byDay = (l) => {
  const m = {};
  l.forEach((e) => (m[sod(e.start)] ??= []).push(e));
  return m;
};
const wavg = (xs) => {
  let a = 0,
    b = 0;
  xs.forEach(([v, w]) => {
    a += v * w;
    b += w;
  });
  return a / b;
};
function makePlan(E, nowT, settings) {
  const MAXAWAKE = 210,
    MINGAP = 30,
    MAXNAP = 180,
    BEDFLEX = 30; // awake windows stay within 30m-3.5h; a lengthened nap is capped at 3h; bedtime may move 30m from the target
  const [bh, bm] = (settings.bedtime || '19:30').split(':').map(Number),
    bt = bh * 60 + bm,
    lo = bt - BEDFLEX,
    hi = bt + BEDFLEX;
  const today = sod(nowT),
    nowM = tod(nowT),
    from = today - 7 * DAY,
    inWin = (d) => +d >= from && +d < today; // "past 7 days" = the 7 full days before today
  const naps = E.filter((e) => e.type === 'nap').sort((a, b) => a.start - b.start),
    done = byDay(naps.filter((e) => e.end));
  // recent days count more: a day's weight halves every 4 days (tested on the logged history: this tracks changes sooner)
  const rw = (day) => Math.pow(0.5, Math.round((today - day) / DAY) / 4);
  const wakeOf = (day) => E.find((e) => e.type === 'night' && e.end && sod(e.end) === day); // that morning's wake-up
  // the n-th nap of the day: usual start, usual length, and the usual awake window before it (from the end of the previous sleep).
  // The awake window is what the plan is built on: a late wake-up or a long nap moves everything after it.
  const suggest = (n) => {
    const xs = [],
      gs = [];
    for (const d in done)
      if (inWin(d) && done[d][n - 1]) {
        const e = done[d][n - 1],
          w = rw(+d);
        xs.push([e, w]);
        const pe = n === 1 ? (wakeOf(+d) || {}).end : done[d][n - 2].end;
        if (pe && e.start > pe) gs.push([(e.start - pe) / 6e4, w]);
      }
    return xs.length
      ? {
          start: wavg(xs.map(([e, w]) => [tod(e.start), w])),
          len: wavg(xs.map(([e, w]) => [(e.end - e.start) / 6e4, w])),
          gap: gs.length ? wavg(gs) : null,
          n: xs.length,
        }
      : null;
  };
  // usual time between the last nap of the day and bedtime (recent days weighted more)
  const bedGap = () => {
    const xs = [];
    for (const d in done)
      if (inWin(d)) {
        const b = E.find((e) => e.type === 'night' && sod(e.start) === +d),
          l = done[d][done[d].length - 1];
        if (b && b.start > l.end) xs.push([(b.start - l.end) / 6e4, rw(+d)]);
      }
    return xs.length ? wavg(xs) : null;
  };
  // target for total nap time per day = average of the daily nap totals over the past 7 days (night sleep not counted)
  const xsT = [];
  for (const d in done) if (inWin(d)) xsT.push(done[d].reduce((s, e) => s + (e.end - e.start) / 6e4, 0));
  const T = xsT.length ? avg(xsT) : null;
  // wake-up: this morning's real one, or the average of the past 7 mornings
  const we = E.find((e) => e.type === 'night' && e.end && e.end >= today);
  const wks = E.filter((e) => e.type === 'night' && e.end && e.end >= from && e.end < today).map((e) => tod(e.end));
  const wk0 = we ? tod(we.end) : wks.length ? avg(wks) : null;

  const run = E.find((e) => !e.end);
  const tn = naps.filter((e) => sod(e.start) === today),
    N = Math.max((+settings.targetNaps || 0) + (+settings.extraNaps || 0), tn.length); // extraNaps: naps added to today's plan by hand
  // target length of a nap in progress: what is left of the day's nap-time target after the other naps today and
  // the usual length of the naps still to come (between 20 min and 3 h); just its usual length when there is no target
  const CAP = 1.5; // catching up: a nap is stretched to at most 1.5× its usual length
  // a nap number with no data in the past 7 days (say a 4th nap on 3-nap days) borrows the awake window and length of
  // the last nap number that has data, so the plan and bedtime can still be worked out (from = the nap it borrows from)
  const sugB0 = (n) => {
    for (let k = n; k >= 1; k--) {
      const g = suggest(k);
      if (g) return k === n ? g : { ...g, from: k };
    }
    return null;
  };
  // a bridge nap: beyond the target number of naps (an added nap) or without data of its own. It is short (max 45 min).
  const TN = +settings.targetNaps || 0;
  const sugB = (n) => {
    const g = sugB0(n);
    return g && (g.from || n > TN) ? { ...g, bridge: true } : g;
  };
  const later = (n) => {
    let x = 0;
    for (let k = n + 1; k <= N; k++) {
      const g = sugB(k);
      if (g) x += g.bridge ? Math.min(45, g.len) : g.len;
    }
    return x;
  };
  const runTarget = (a) => {
    const n = tn.indexOf(a) + 1,
      g = sugB(n);
    // a nap beyond her usual number (added, or no data for that nap number) is a bridge nap: at most 45 min, as planned
    const cap = g && g.bridge ? Math.min(45, g.len) : MAXNAP;
    if (T == null) return g ? Math.min(g.len, cap) : null;
    // a nap before the day's last one: its usual length (the nap-time budget overestimated these by ~25 min in the backtest)
    if (n < N && g) return Math.min(cap, g.len);
    // the day's last nap: what is left of today's nap time, at least 20 min; but long enough that the stretch to the target
    // bedtime is at most her usual gap before bed + 35 min (and never beyond 1.5× its usual length)
    const others = tn.filter((x) => x !== a).reduce((s, x) => s + ((x.end || nowT) - x.start) / 6e4, 0),
      bud = Math.max(20, T - others - later(n));
    const bg = bedGap(),
      fl = bg != null ? bt - (bg + 35) - tod(a.start) : 0;
    return Math.min(cap, Math.max(bud, Math.min(fl, g ? g.len * 1.5 : fl)));
  };
  const exp = (a) => {
    // end of a logged nap; one still running is expected to last until its target
    if (a.end) return tod(a.end);
    const L = runTarget(a);
    return Math.max(nowM, L != null ? tod(a.start) + L : nowM);
  };
  // suggestions for the naps still to come, lengthened when earlier naps were short so the day reaches the target nap time.
  // A nap is stretched by at most half its usual length (and never beyond 3 h): babies rarely make up a short day in one
  // very long nap. What is still missing after that (`left`) may become a suggested extra nap further down.
  const gs = {};
  // a borrowed nap (no data for that nap number) is treated like a bridge nap: at most 45 min, halfway to bedtime
  for (let n = tn.length + 1; n <= N; n++) {
    const g = sugB(n);
    if (g) gs[n] = g.bridge ? { ...g, len: Math.min(45, g.len) } : { ...g };
  }
  const rem = Object.keys(gs)
    .map(Number)
    .filter((n) => !gs[n].bridge); // bridge naps are not stretched
  let left = 0;
  if (T != null) {
    // every planned nap counts towards the target (bridge-style ones too), but only the regular ones are stretched
    const A = tn.reduce((x, a) => x + Math.max(0, exp(a) - tod(a.start)), 0),
      Sall = Object.keys(gs).reduce((x, n) => x + gs[n].len, 0),
      S = rem.reduce((x, n) => x + gs[n].len, 0),
      def = T - A - Sall;
    if (def > 0) {
      left = def;
      rem.forEach((n) => {
        const add = Math.min((def * gs[n].len) / S, MAXNAP - gs[n].len, (CAP - 1) * gs[n].len);
        if (add > 0) {
          gs[n].add = add;
          gs[n].len += add;
          left -= add;
        }
      });
    }
  }

  let prev = wk0;
  // naps already logged keep their real times
  const rows = [];
  tn.forEach((a, i) => {
    const s = tod(a.start),
      e = exp(a);
    rows.push({ n: i + 1, a, s, e, aw: prev != null && s > prev ? s - prev : null });
    prev = e;
  });

  // naps still to come: their usual awake window after the previous sleep, within the awake limits; d moves them all together
  const nums = [];
  for (let n = tn.length + 1; n <= N; n++) nums.push(n);
  const planFor = (nums) => {
    // More naps than she usually takes (an added or borrowed nap): the time left until bedtime is shared evenly over the
    // remaining awake windows (each window at most its usual length), so every nap moves a bit earlier, not just the last.
    const extraDay = nums.some((n) => gs[n] && gs[n].bridge);
    const sched = (d) => {
      let pv = prev,
        ok = true;
      const out = [];
      const w =
        extraDay && pv != null
          ? (bt - pv - nums.reduce((x, n) => x + (gs[n] ? gs[n].len : 0), 0)) / (nums.length + 1)
          : null;
      nums.forEach((n) => {
        const g = gs[n];
        if (!g) {
          out.push({ n, nodata: true });
          pv = null;
          ok = false;
          return;
        }
        const gap =
          w != null
            ? Math.max(MINGAP, g.bridge ? w : Math.min(g.gap != null ? g.gap : w, w))
            : g.bridge
              ? Math.max(MINGAP, Math.min(g.gap, (bt - pv - g.len) / 2))
              : g.gap;
        let s = (pv != null && gap != null ? pv + gap : g.start) + d; // usual clock time if the awake window is unknown
        if (pv != null) s = Math.max(Math.min(s, pv + MAXAWAKE), pv + MINGAP);
        out.push({
          n,
          s,
          e: s + g.len,
          add: g.add || 0,
          aw: pv != null && s > pv ? s - pv : null,
          from: g.from,
          bridge: g.bridge,
          extra: g.extra,
        });
        pv = s + g.len;
      });
      return { out, last: pv, done: ok };
    };
    // bedtime: the target, allowed to move BEDFLEX either way while the last awake window stays within limits.
    // If that is not possible, the remaining naps are shifted (as little as possible) until it is.
    const fit = (d) => {
      const r = sched(d);
      if (!r.done || r.last == null) return null;
      const x = Math.max(r.last + MINGAP, lo),
        y = Math.min(r.last + MAXAWAKE, hi);
      return { r, x, y, ok: x <= y };
    };
    let best = fit(0),
      shift = 0;
    if (best && !best.ok && nums.length) {
      search: for (let k = 5; k <= 240; k += 5)
        for (const d of [-k, k]) {
          const f = fit(d);
          if (f && f.ok) {
            best = f;
            shift = d;
            break search;
          }
        }
    }
    return { best, shift, plan: best ? best.r : sched(0) };
  };
  let P = planFor(nums);
  // extra ("bridge") nap: when stretching could not make up the day's nap time (15+ min missing), suggest a short extra
  // nap (30-45 min) halfway between the last planned nap and the target bedtime, but only with at least 75 min awake on
  // each side (so it is never right after a nap or right before bed) and at most 3h 30m. Until it is added,
  // bedtime and the countdown ignore it; once added (extraNaps) it becomes a planned nap and bedtime aims for its target.
  // This also covers days where all planned naps are done too early to reach bedtime.
  const bn0 = E.find((e) => e.type === 'night' && sod(e.start) === today);
  let extra = null;
  if (left >= 15 && !bn0 && !(run && run.type === 'night') && P.best && P.plan.last != null) {
    const L = Math.min(45, Math.max(30, left)),
      w = (bt - P.plan.last - L) / 2;
    if (w >= 75 && w <= MAXAWAKE)
      extra = { n: N + 1, s: P.plan.last + w, e: P.plan.last + w + L, add: 0, aw: w, extra: true };
  }
  const { best, shift, plan } = P;
  rows.push(...plan.out);
  if (extra) rows.push(extra);
  let B = null;
  if (best)
    B = best.ok
      ? Math.min(Math.max(bt, best.x), best.y)
      : plan.last + MAXAWAKE < lo
        ? plan.last + MAXAWAKE
        : plan.last + MINGAP;
  // lean 35% towards last nap + the usual gap to bedtime, but never outside the limits above (not after a bridge-style nap,
  // whose gap to bedtime is shorter than usual)
  const bg = bedGap();
  const lastRow = plan.out.length ? plan.out[plan.out.length - 1] : rows[rows.length - 1],
    sg = lastRow && sugB(lastRow.n);
  // after a nap you added on purpose (planned or in progress) bedtime aims for its target: no lean towards a later bedtime
  const bridgeLast =
    (+settings.extraNaps || 0) > 0 &&
    !!(lastRow && (lastRow.bridge || (lastRow.a && !lastRow.a.end && sg && sg.bridge))); // last nap (planned, or in progress) is beyond her usual naps
  if (B != null && bg != null && plan.last != null && best && best.ok && !bridgeLast)
    B = Math.min(Math.max(0.65 * B + 0.35 * (plan.last + bg), best.x), best.y);
  // a suggested extra nap is only a suggestion: until it is added (extraNaps), bedtime is planned without it
  const bn = E.find((e) => e.type === 'night' && sod(e.start) === today);

  // the next event while awake, and the notification for it (30 min before)
  let next = null,
    want = null;
  if (!run && !bn) {
    const r = rows.find((x) => !x.a && !x.extra); // a suggested extra nap is not the next event until it is added
    if (r && !r.nodata)
      next = r.extra
        ? { label: 'Extra nap', name: 'Extra nap', key: 'nap' + r.n, t: r.s }
        : { label: 'Next nap', name: 'Nap ' + r.n, key: 'nap' + r.n, t: r.s };
    else if (!r && B != null) next = { label: 'Bedtime', name: 'Bedtime', key: 'bed', t: B };
    if (next) {
      const ev = today + next.t * 60000;
      want = {
        key: next.key + '-' + isoDay(today),
        at: ev - 30 * 60000,
        event: ev,
        label: next.name,
        time: hm(next.t),
      };
    }
  }
  // expected night length: the average of the nights in the last 8 days
  const nts = E.filter((e) => e.type === 'night' && e.end && e.end >= nowT - 8 * DAY),
    avgN = nts.length ? avg(nts.map((e) => (e.end - e.start) / 6e4)) : 630;
  const napDone = tn.reduce((x, a) => x + ((a.end || nowT) - a.start) / 6e4, 0);
  const ra = tn.find((e) => !e.end),
    cur = ra && runTarget(ra) != null ? { len: runTarget(ra), end: tod(ra.start) + runTarget(ra) } : null;
  return {
    cur,
    now: nowT,
    today,
    nowM,
    run,
    we,
    wk0,
    T,
    tn,
    rows,
    last: plan.last,
    B,
    bt,
    lo,
    shift,
    bn,
    next,
    want,
    avgN,
    napDone,
  };
}

// What the plan predicted for a nap or night that is being started now, saved with the entry so the real-world
// accuracy of each app version can be measured later (tools/accuracy.mjs). s = predicted start (ms),
// len = predicted length (min), n = nap number. null when there was no prediction (no data, or bedtime already logged).
function predFor(p, type) {
  if (type === 'nap') {
    const r = p.rows.find((x) => !x.a && !x.nodata);
    return r ? { s: Math.round(p.today + r.s * 6e4), len: Math.round(r.e - r.s), n: r.n } : null;
  }
  if (type === 'night')
    return p.bn || p.B == null ? null : { s: Math.round(p.today + p.B * 6e4), len: Math.round(p.avgN) };
  return null;
}

// What the plan would have predicted for an entry just before it started, using only what was logged before it.
// The result is the same whether the entry is started live with the button or filled in later by hand, so logging
// late still records expected vs actual times.
function predBefore(E, e, settings) {
  const t = e.start - 6e4,
    seen = E.filter((x) => x.id !== e.id && x.start < t).map((x) => (x.end && x.end > t ? { ...x, end: null } : x));
  return predFor(makePlan(seen, t, settings), e.type);
}

// Per-day figures for the Statistics tab, for the `days` full days before `today` (today itself is not complete yet).
// Times are minutes of the day (a bedtime after midnight counts as 24:xx); lengths are minutes.
//   wake: morning wake-up · bed: bedtime · night: length of the night that started that evening
//   naps: [{s, e, len}] in order · napSum: total nap time · awake: wake-up to bedtime minus naps
function dailyStats(E, today, days) {
  const out = [];
  for (let i = days; i >= 1; i--) {
    const day = sod(today - i * DAY + 12 * 36e5); // noon-based so daylight-saving days still land on the right date
    const naps = E.filter((e) => e.type === 'nap' && e.end && sod(e.start) === day)
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ s: tod(e.start), e: tod(e.end), len: (e.end - e.start) / 6e4 }));
    const wn = E.find((e) => e.type === 'night' && e.end && sod(e.end) === day),
      bn = E.find((e) => e.type === 'night' && sod(e.start) === day);
    const wake = wn ? tod(wn.end) : null;
    let bed = bn ? tod(bn.start) : null;
    if (bed != null && bed < 12 * 60) bed += 24 * 60;
    const night = bn && bn.end ? (bn.end - bn.start) / 6e4 : null,
      napSum = naps.length ? naps.reduce((x, n) => x + n.len, 0) : null;
    out.push({
      day,
      wake,
      bed,
      night,
      naps,
      napSum,
      awake: wake != null && bed != null ? bed - wake - (napSum || 0) : null,
    });
  }
  return out;
}

if (typeof module !== 'undefined')
  module.exports = { makePlan, predFor, predBefore, dailyStats, sod, tod, hm, dur, avg, isoDay, DAY };
