// Nap Log: the plan maths (times, averages, today's suggested naps and bedtime).
// No screen code here: index.html loads this file and draws what makePlan returns,
// and the tests (tests/plan.test.mjs) load it directly in Node.
// All "minutes" are minutes since local midnight; timestamps are milliseconds.
const DAY = 864e5,
  pad2 = (n) => String(n).padStart(2, '0');
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return +d;
};
const minuteOfDay = (t) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
const clockTime = (m) => {
  m = Math.round(m);
  return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
};
// "45m", "3h 30m" (a non-breaking space keeps it on one line)
const duration = (m) => {
  m = Math.round(m);
  return m >= 60 ? Math.floor(m / 60) + 'h\u00a0' + pad2(m % 60) + 'm' : m + 'm';
};
const average = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const isoDay = (t) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};
// Days are not always 24 hours: on the night the clocks change a day has 23 or 25. So these two count calendar days
// and clock time, never fixed hours.
// local midnight `n` calendar days after the local midnight `dayStart` (n may be negative)
const addDays = (dayStart, n) => {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  return +d;
};
// the moment a minute-of-day (as the plan uses, fractions allowed) falls on the day that starts at `dayStart`: "08:26"
// is 08:26 on the clock even on a day the clocks changed earlier (dayStart + minutes alone would be an hour off then)
const timeAtMinute = (dayStart, minutes) => {
  const naive = dayStart + minutes * 60000;
  return naive + (new Date(naive).getTimezoneOffset() - new Date(dayStart).getTimezoneOffset()) * 60000;
};

// ---------- the plan ----------
// makePlan(entries, now, settings) works out today's plan from the logged history. It is pure: it only uses its
// inputs (never the screen, the clock or globals), so render() just draws what it returns, and tests and
// backtests can call it with any history and any "now".
const groupByDay = (l) => {
  const m = {};
  l.forEach((e) => (m[startOfDay(e.start)] ??= []).push(e));
  return m;
};
const weightedAverage = (xs) => {
  let a = 0,
    b = 0;
  xs.forEach(([v, w]) => {
    a += v * w;
    b += w;
  });
  return a / b;
};
function makePlan(entries, nowMs, settings) {
  const MAX_AWAKE = 210,
    MIN_AWAKE = 30,
    MAX_NAP = 180,
    BEDTIME_FLEX = 30; // awake windows stay within 30m-3.5h; a lengthened nap is capped at 3h; bedtime may move 30m from the target
  const [bedHour, bedMinute] = (settings.bedtime || '19:30').split(':').map(Number),
    targetBedtime = bedHour * 60 + bedMinute,
    earliestBedtime = targetBedtime - BEDTIME_FLEX,
    latestBedtime = targetBedtime + BEDTIME_FLEX;
  const today = startOfDay(nowMs),
    nowMin = minuteOfDay(nowMs),
    weekStart = addDays(today, -7),
    inPastWeek = (d) => +d >= weekStart && +d < today; // "past 7 days" = the 7 full days before today
  const naps = entries.filter((e) => e.type === 'nap').sort((a, b) => a.start - b.start),
    finishedNapsByDay = groupByDay(naps.filter((e) => e.end));
  // recent days count more: a day's weight halves every 4 days (tested on the logged history: this tracks changes sooner)
  const dayWeight = (day) => Math.pow(0.5, Math.round((today - day) / DAY) / 4);
  const wakeUpOf = (day) => entries.find((e) => e.type === 'night' && e.end && startOfDay(e.end) === day); // that morning's wake-up
  // the n-th nap of the day: usual start, usual length, and the usual awake window before it (from the end of the previous sleep).
  // The awake window is what the plan is built on: a late wake-up or a long nap moves everything after it.
  const usualNap = (n) => {
    const samples = [],
      awakeGaps = [];
    for (const d in finishedNapsByDay)
      if (inPastWeek(d) && finishedNapsByDay[d][n - 1]) {
        const e = finishedNapsByDay[d][n - 1],
          w = dayWeight(+d);
        samples.push([e, w]);
        const prevEnd = n === 1 ? (wakeUpOf(+d) || {}).end : finishedNapsByDay[d][n - 2].end;
        if (prevEnd && e.start > prevEnd) awakeGaps.push([(e.start - prevEnd) / 6e4, w]);
      }
    return samples.length
      ? {
          start: weightedAverage(samples.map(([e, w]) => [minuteOfDay(e.start), w])),
          len: weightedAverage(samples.map(([e, w]) => [(e.end - e.start) / 6e4, w])),
          gap: awakeGaps.length ? weightedAverage(awakeGaps) : null,
          n: samples.length,
        }
      : null;
  };
  // usual time between the last nap of the day and bedtime (recent days weighted more)
  const usualGapBeforeBed = () => {
    const xs = [];
    for (const d in finishedNapsByDay)
      if (inPastWeek(d)) {
        const b = entries.find((e) => e.type === 'night' && startOfDay(e.start) === +d),
          l = finishedNapsByDay[d][finishedNapsByDay[d].length - 1];
        if (b && b.start > l.end) xs.push([(b.start - l.end) / 6e4, dayWeight(+d)]);
      }
    return xs.length ? weightedAverage(xs) : null;
  };
  // target for total nap time per day = average of the daily nap totals over the past 7 days (night sleep not counted)
  const dailyNapTotals = [];
  for (const d in finishedNapsByDay)
    if (inPastWeek(d)) dailyNapTotals.push(finishedNapsByDay[d].reduce((s, e) => s + (e.end - e.start) / 6e4, 0));
  const napTarget = dailyNapTotals.length ? average(dailyNapTotals) : null;
  // wake-up: this morning's real one, or the average of the past 7 mornings
  const wokeThisMorning = entries.find((e) => e.type === 'night' && e.end && e.end >= today);
  const pastWakeUps = entries
    .filter((e) => e.type === 'night' && e.end && e.end >= weekStart && e.end < today)
    .map((e) => minuteOfDay(e.end));
  const wakeUp = wokeThisMorning ? minuteOfDay(wokeThisMorning.end) : pastWakeUps.length ? average(pastWakeUps) : null;

  const running = entries.find((e) => !e.end);
  const todaysNaps = naps.filter((e) => startOfDay(e.start) === today),
    plannedNaps = Math.max((+settings.targetNaps || 0) + (+settings.extraNaps || 0), todaysNaps.length); // extraNaps: naps added to today's plan by hand
  // target length of a nap in progress: what is left of the day's nap-time target after the other naps today and
  // the usual length of the naps still to come (between 20 min and 3 h); just its usual length when there is no target
  const CATCH_UP_CAP = 1.5; // catching up: a nap is stretched to at most 1.5× its usual length
  // a nap number with no data in the past 7 days (say a 4th nap on 3-nap days) borrows the awake window and length of
  // the last nap number that has data, so the plan and bedtime can still be worked out (from = the nap it borrows from)
  const usualOrBorrowedNap = (n) => {
    for (let k = n; k >= 1; k--) {
      const g = usualNap(k);
      if (g) return k === n ? g : { ...g, from: k };
    }
    return null;
  };
  // a bridge nap: beyond the target number of naps (an added nap) or without data of its own. It is short (max 45 min).
  const targetNaps = +settings.targetNaps || 0;
  const napFor = (n) => {
    const g = usualOrBorrowedNap(n);
    return g && (g.from || n > targetNaps) ? { ...g, bridge: true } : g;
  };
  const usualLengthAfter = (n) => {
    let x = 0;
    for (let k = n + 1; k <= plannedNaps; k++) {
      const g = napFor(k);
      if (g) x += g.bridge ? Math.min(45, g.len) : g.len;
    }
    return x;
  };
  const targetLengthOf = (a) => {
    const n = todaysNaps.indexOf(a) + 1,
      g = napFor(n);
    // a nap beyond her usual number (added, or no data for that nap number) is a bridge nap: at most 45 min, as planned
    const cap = g && g.bridge ? Math.min(45, g.len) : MAX_NAP;
    if (napTarget == null) return g ? Math.min(g.len, cap) : null;
    // a nap before the day's last one: its usual length (the nap-time budget overestimated these by ~25 min in the backtest)
    if (n < plannedNaps && g) return Math.min(cap, g.len);
    // the day's last nap: what is left of today's nap time, at least 20 min; but long enough that the stretch to the target
    // bedtime is at most her usual gap before bed + 35 min (and never beyond 1.5× its usual length)
    const otherNapsToday = todaysNaps
        .filter((x) => x !== a)
        .reduce((s, x) => s + ((x.end || nowMs) - x.start) / 6e4, 0),
      budget = Math.max(20, napTarget - otherNapsToday - usualLengthAfter(n));
    const gapBefore = usualGapBeforeBed(),
      floor = gapBefore != null ? targetBedtime - (gapBefore + 35) - minuteOfDay(a.start) : 0;
    return Math.min(cap, Math.max(budget, Math.min(floor, g ? g.len * 1.5 : floor)));
  };
  const expectedEnd = (a) => {
    // end of a logged nap; one still running is expected to last until its target
    if (a.end) return minuteOfDay(a.end);
    const L = targetLengthOf(a);
    return Math.max(nowMin, L != null ? minuteOfDay(a.start) + L : nowMin);
  };
  // suggestions for the naps still to come, lengthened when earlier naps were short so the day reaches the target nap time.
  // A nap is stretched by at most half its usual length (and never beyond 3 h): babies rarely make up a short day in one
  // very long nap. What is still missing after that (`left`) may become a suggested extra nap further down.
  const upcoming = {};
  // a borrowed nap (no data for that nap number) is treated like a bridge nap: at most 45 min, halfway to bedtime
  for (let n = todaysNaps.length + 1; n <= plannedNaps; n++) {
    const g = napFor(n);
    if (g) upcoming[n] = g.bridge ? { ...g, len: Math.min(45, g.len) } : { ...g };
  }
  const stretchable = Object.keys(upcoming)
    .map(Number)
    .filter((n) => !upcoming[n].bridge); // bridge naps are not stretched
  let napTimeMissing = 0;
  if (napTarget != null) {
    // every planned nap counts towards the target (bridge-style ones too), but only the regular ones are stretched
    const A = todaysNaps.reduce((x, a) => x + Math.max(0, expectedEnd(a) - minuteOfDay(a.start)), 0),
      Sall = Object.keys(upcoming).reduce((x, n) => x + upcoming[n].len, 0),
      S = stretchable.reduce((x, n) => x + upcoming[n].len, 0),
      def = napTarget - A - Sall;
    if (def > 0) {
      napTimeMissing = def;
      stretchable.forEach((n) => {
        const add = Math.min(
          (def * upcoming[n].len) / S,
          MAX_NAP - upcoming[n].len,
          (CATCH_UP_CAP - 1) * upcoming[n].len,
        );
        if (add > 0) {
          upcoming[n].add = add;
          upcoming[n].len += add;
          napTimeMissing -= add;
        }
      });
    }
  }

  let lastSleepEnd = wakeUp;
  // naps already logged keep their real times
  const rows = [];
  todaysNaps.forEach((a, i) => {
    const s = minuteOfDay(a.start),
      e = expectedEnd(a);
    rows.push({ n: i + 1, a, s, e, aw: lastSleepEnd != null && s > lastSleepEnd ? s - lastSleepEnd : null });
    lastSleepEnd = e;
  });

  // naps still to come: their usual awake window after the previous sleep, within the awake limits; d moves them all together
  const napsToPlan = [];
  for (let n = todaysNaps.length + 1; n <= plannedNaps; n++) napsToPlan.push(n);
  const scheduleNaps = (numbers) => {
    // More naps than she usually takes (an added or borrowed nap): the time left until bedtime is shared evenly over the
    // remaining awake windows (each window at most its usual length), so every nap moves a bit earlier, not just the last.
    const hasExtraNap = numbers.some((n) => upcoming[n] && upcoming[n].bridge);
    const placeNaps = (d) => {
      let cursor = lastSleepEnd,
        ok = true;
      const out = [];
      const sharedGap =
        hasExtraNap && cursor != null
          ? (targetBedtime - cursor - numbers.reduce((x, n) => x + (upcoming[n] ? upcoming[n].len : 0), 0)) /
            (numbers.length + 1)
          : null;
      numbers.forEach((n) => {
        const g = upcoming[n];
        if (!g) {
          out.push({ n, nodata: true });
          cursor = null;
          ok = false;
          return;
        }
        const gap =
          sharedGap != null
            ? Math.max(MIN_AWAKE, g.bridge ? sharedGap : Math.min(g.gap != null ? g.gap : sharedGap, sharedGap))
            : g.bridge
              ? Math.max(MIN_AWAKE, Math.min(g.gap, (targetBedtime - cursor - g.len) / 2))
              : g.gap;
        let s = (cursor != null && gap != null ? cursor + gap : g.start) + d; // usual clock time if the awake window is unknown
        if (cursor != null) s = Math.max(Math.min(s, cursor + MAX_AWAKE), cursor + MIN_AWAKE);
        out.push({
          n,
          s,
          e: s + g.len,
          add: g.add || 0,
          aw: cursor != null && s > cursor ? s - cursor : null,
          from: g.from,
          bridge: g.bridge,
          extra: g.extra,
        });
        cursor = s + g.len;
      });
      return { out, last: cursor, done: ok };
    };
    // bedtime: the target, allowed to move BEDFLEX either way while the last awake window stays within limits.
    // If that is not possible, the remaining naps are shifted (as little as possible) until it is.
    const fitBedtime = (d) => {
      const r = placeNaps(d);
      if (!r.done || r.last == null) return null;
      const x = Math.max(r.last + MIN_AWAKE, earliestBedtime),
        y = Math.min(r.last + MAX_AWAKE, latestBedtime);
      return { r, x, y, ok: x <= y };
    };
    let best = fitBedtime(0),
      shift = 0;
    if (best && !best.ok && numbers.length) {
      search: for (let k = 5; k <= 240; k += 5)
        for (const d of [-k, k]) {
          const f = fitBedtime(d);
          if (f && f.ok) {
            best = f;
            shift = d;
            break search;
          }
        }
    }
    return { best, shift, plan: best ? best.r : placeNaps(0) };
  };
  let scheduled = scheduleNaps(napsToPlan);
  // extra ("bridge") nap: when stretching could not make up the day's nap time (15+ min missing), suggest a short extra
  // nap (30-45 min) halfway between the last planned nap and the target bedtime, but only with at least 75 min awake on
  // each side (so it is never right after a nap or right before bed) and at most 3h 30m. Until it is added,
  // bedtime and the countdown ignore it; once added (extraNaps) it becomes a planned nap and bedtime aims for its target.
  // This also covers days where all planned naps are done too early to reach bedtime.
  const bedtimeLogged = entries.find((e) => e.type === 'night' && startOfDay(e.start) === today);
  let extraSuggestion = null;
  if (
    napTimeMissing >= 15 &&
    !bedtimeLogged &&
    !(running && running.type === 'night') &&
    scheduled.best &&
    scheduled.plan.last != null
  ) {
    const L = Math.min(45, Math.max(30, napTimeMissing)),
      w = (targetBedtime - scheduled.plan.last - L) / 2;
    if (w >= 75 && w <= MAX_AWAKE)
      extraSuggestion = {
        n: plannedNaps + 1,
        s: scheduled.plan.last + w,
        e: scheduled.plan.last + w + L,
        add: 0,
        aw: w,
        extra: true,
      };
  }
  const { best, shift, plan } = scheduled;
  rows.push(...plan.out);
  if (extraSuggestion) rows.push(extraSuggestion);
  let bedtime = null;
  if (best)
    bedtime = best.ok
      ? Math.min(Math.max(targetBedtime, best.x), best.y)
      : plan.last + MAX_AWAKE < earliestBedtime
        ? plan.last + MAX_AWAKE
        : plan.last + MIN_AWAKE;
  // lean 35% towards last nap + the usual gap to bedtime, but never outside the limits above (not after a bridge-style nap,
  // whose gap to bedtime is shorter than usual)
  const gapBeforeBed = usualGapBeforeBed();
  const lastRow = plan.out.length ? plan.out[plan.out.length - 1] : rows[rows.length - 1],
    lastNapPlan = lastRow && napFor(lastRow.n);
  // after a nap you added on purpose (planned or in progress) bedtime aims for its target: no lean towards a later bedtime
  const endsWithAddedNap =
    (+settings.extraNaps || 0) > 0 &&
    !!(lastRow && (lastRow.bridge || (lastRow.a && !lastRow.a.end && lastNapPlan && lastNapPlan.bridge))); // last nap (planned, or in progress) is beyond her usual naps
  if (bedtime != null && gapBeforeBed != null && plan.last != null && best && best.ok && !endsWithAddedNap)
    bedtime = Math.min(Math.max(0.65 * bedtime + 0.35 * (plan.last + gapBeforeBed), best.x), best.y);
  // a suggested extra nap is only a suggestion: until it is added (extraNaps), bedtime is planned without it
  const bedtimeEntry = entries.find((e) => e.type === 'night' && startOfDay(e.start) === today);

  // the next event while awake, and the notification for it (30 min before)
  let next = null,
    want = null;
  if (!running && !bedtimeEntry) {
    const r = rows.find((x) => !x.a && !x.extra); // a suggested extra nap is not the next event until it is added
    if (r && !r.nodata)
      next = r.extra
        ? { label: 'Extra nap', name: 'Extra nap', key: 'nap' + r.n, t: r.s }
        : { label: 'Next nap', name: 'Nap ' + r.n, key: 'nap' + r.n, t: r.s };
    else if (!r && bedtime != null) next = { label: 'Bedtime', name: 'Bedtime', key: 'bed', t: bedtime };
    if (next) {
      const ev = timeAtMinute(today, next.t);
      want = {
        key: next.key + '-' + isoDay(today),
        at: ev - 30 * 60000,
        event: ev,
        label: next.name,
        time: clockTime(next.t),
      };
    }
  }
  // expected night length: the average of the nights in the last 8 days
  const recentNights = entries.filter((e) => e.type === 'night' && e.end && e.end >= nowMs - 8 * DAY),
    nightLength = recentNights.length ? average(recentNights.map((e) => (e.end - e.start) / 6e4)) : 630;
  const napTimeToday = todaysNaps.reduce((x, a) => x + ((a.end || nowMs) - a.start) / 6e4, 0);
  const runningNap = todaysNaps.find((e) => !e.end),
    runningNapTarget =
      runningNap && targetLengthOf(runningNap) != null
        ? { len: targetLengthOf(runningNap), end: minuteOfDay(runningNap.start) + targetLengthOf(runningNap) }
        : null;
  // What the plan is. The short keys are kept as they were (tools/backtest.mjs, the tests and the screen use them):
  //   cur     the nap in progress: {len, end} target length and end (minutes), or null
  //   now     the "now" it was made for (ms) · today: local midnight (ms) · nowM: now in minutes of the day
  //   run     the entry in progress (nap or night), if any · we: the night that ended this morning, if logged
  //   wk0     this morning's wake-up (minutes; logged, or the 7-day average) · T: today's nap-time target (minutes)
  //   tn      today's naps (entries) · rows: the plan rows {n, s, e, a?, aw, add, from, bridge, extra, nodata}
  //   last    end of the last planned nap · B: expected bedtime · bt: target bedtime · lo: earliest allowed bedtime
  //   shift   how far the remaining naps were moved to fit bedtime · bn: tonight's bedtime entry, if logged
  //   next    the next event while awake {label, name, key, t} · want: its reminder {key, at, event, label, time}
  //   avgN    expected night length (minutes) · napDone: nap time so far today (minutes)
  return {
    cur: runningNapTarget,
    now: nowMs,
    today,
    nowM: nowMin,
    run: running,
    we: wokeThisMorning,
    wk0: wakeUp,
    T: napTarget,
    tn: todaysNaps,
    rows,
    last: plan.last,
    B: bedtime,
    bt: targetBedtime,
    lo: earliestBedtime,
    shift,
    bn: bedtimeEntry,
    next,
    want,
    avgN: nightLength,
    napDone: napTimeToday,
  };
}

// What the plan predicted for a nap or night that is being started now, saved with the entry so the real-world
// accuracy of each app version can be measured later (tools/accuracy.mjs). s = predicted start (ms),
// len = predicted length (min), n = nap number. null when there was no prediction (no data, or bedtime already logged).
function predFor(plan, type) {
  if (type === 'nap') {
    const r = plan.rows.find((x) => !x.a && !x.nodata);
    return r ? { s: Math.round(timeAtMinute(plan.today, r.s)), len: Math.round(r.e - r.s), n: r.n } : null;
  }
  if (type === 'night')
    return plan.bn || plan.B == null
      ? null
      : { s: Math.round(timeAtMinute(plan.today, plan.B)), len: Math.round(plan.avgN) };
  return null;
}

// What the plan would have predicted for an entry just before it started, using only what was logged before it.
// The result is the same whether the entry is started live with the button or filled in later by hand, so logging
// late still records expected vs actual times.
function predBefore(entries, e, settings) {
  const t = e.start - 6e4,
    seen = entries
      .filter((x) => x.id !== e.id && x.start < t)
      .map((x) => (x.end && x.end > t ? { ...x, end: null } : x));
  return predFor(makePlan(seen, t, settings), e.type);
}

// Per-day figures for the Statistics tab, for the `days` full days before `today` (today itself is not complete yet).
// Times are minutes of the day (a bedtime after midnight counts as 24:xx); lengths are minutes.
//   wake: morning wake-up · bed: bedtime · night: length of the night that started that evening
//   naps: [{s, e, len}] in order · napSum: total nap time · awake: wake-up to bedtime minus naps
function dailyStats(entries, today, days) {
  const out = [];
  for (let i = days; i >= 1; i--) {
    const day = startOfDay(today - i * DAY + 12 * 36e5); // noon-based so daylight-saving days still land on the right date
    const naps = entries
      .filter((e) => e.type === 'nap' && e.end && startOfDay(e.start) === day)
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ s: minuteOfDay(e.start), e: minuteOfDay(e.end), len: (e.end - e.start) / 6e4 }));
    const wn = entries.find((e) => e.type === 'night' && e.end && startOfDay(e.end) === day),
      bn = entries.find((e) => e.type === 'night' && startOfDay(e.start) === day);
    const wake = wn ? minuteOfDay(wn.end) : null;
    let bed = bn ? minuteOfDay(bn.start) : null;
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
  module.exports = {
    makePlan,
    predFor,
    addDays,
    timeAtMinute,
    predBefore,
    dailyStats,
    startOfDay,
    minuteOfDay,
    clockTime,
    duration,
    average,
    isoDay,
    DAY,
  };
