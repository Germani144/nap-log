// The Today tab: the ring, the countdown, the buttons and today's plan, plus the plan animation.

let redrawRing = null,
  ringNaps = null;
// what each plan row says, to see which rows changed after the plan was rearranged
const planRowTexts = () =>
  Object.fromEntries(
    [...document.querySelectorAll('#plan .it')].map((el) => [
      el.querySelector('.t').textContent,
      el.querySelector('.r').textContent,
    ]),
  );
// after adding an extra nap or editing an entry: the ring morphs from the old plan to the new one (naps shrink, slide,
// appear) and in the list new rows slide in while rows whose times changed briefly glow. The animation reads the current
// ring element and rows on every frame, so it survives the extra redraws that arrive from the database in shared mode.
let planAnimation = null;
const prefersReducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// rows redrawn mid-animation continue where they were (negative delay) instead of starting over, so nothing flickers
function markChangedRows() {
  if (!planAnimation) return;
  const el0 = performance.now() - planAnimation.t0;
  document.querySelectorAll('#plan .it').forEach((el) => {
    const k = el.querySelector('.t').textContent,
      b = el.querySelector('.r b');
    if (!(k in planAnimation.list)) {
      if (el0 < 600) {
        el.classList.add('enter');
        el.style.animationDelay = -el0 + 'ms';
      }
    } else if (planAnimation.list[k] !== el.querySelector('.r').textContent && el0 < 1600) {
      el.classList.add('flash');
      if (b) b.style.animationDelay = -el0 + 'ms';
    }
  });
}
function animatePlan(before, beforeList) {
  if (prefersReducedMotion()) return;
  planAnimation = { before, list: beforeList, t0: performance.now() };
  markChangedRows();
  if (!redrawRing || !before) return;
  const old = {};
  before.forEach((r) => {
    old[r.n] = r;
  });
  const D = 700;
  const step = (now) => {
    if (!planAnimation) return;
    let t = Math.min(1, (now - planAnimation.t0) / D);
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const svgEl = $('#hero svg.ring');
    if (svgEl && redrawRing && ringNaps && t < 1) {
      const rows = ringNaps.map((r) => {
        const o = old[r.n];
        if (o) return { ...r, s: o.s + (r.s - o.s) * k, e: o.e + (r.e - o.e) * k };
        const m = (r.s + r.e) / 2,
          h = ((r.e - r.s) / 2) * k;
        return { ...r, s: m - h, e: m + h };
      });
      svgEl.innerHTML = redrawRing(rows);
      requestAnimationFrame(step);
    } else {
      // done: one normal redraw puts the labels back
      ringAnimating = false;
      render();
    }
  };
  ringAnimating = true;
  requestAnimationFrame(step);
}
let ringAnimating = false;
// changes made by hand (adding an extra nap, editing or deleting an entry) animate the plan on the next render.
// In shared mode that render comes a moment later, when the change arrives back from the database.
let pendingAnimation = null;
const animateNextRender = () => {
  pendingAnimation = { before: ringNaps, list: planRowTexts(), t: Date.now() };
};

// The day's awake time (this morning's wake-up to bedtime), shown at night as a faint bracket joining those two rows.
// It is drawn after the rows are on screen because it needs their positions.
let awakeSpanLabel = '';
function drawAwakeSpan() {
  const pl = $('#plan');
  pl.querySelector('.dayspan')?.remove();
  const a = pl.querySelector('[data-k=w]'),
    b = pl.querySelector('[data-k=b]');
  if (!awakeSpanLabel || !a || !b || !a.offsetHeight) return;
  const y1 = a.offsetTop + 21,
    y2 = b.offsetTop + 21,
    d = document.createElement('div');
  d.className = 'dayspan';
  d.style.top = y1 + 'px';
  d.style.height = y2 - y1 + 'px';
  d.innerHTML = `<span>${awakeSpanLabel}</span>`;
  pl.appendChild(d);
}
// ---------- the Today tab: render() ----------
function render() {
  const plan = makePlan(entries, Date.now(), planSettings());
  const {
    now: nowMs,
    today,
    nowM: nowMin,
    run: running,
    we: wokeThisMorning,
    wk0: wakeUp,
    T: napTarget,
    tn: todaysNaps,
    rows,
    B: bedtime,
    bt: targetBedtime,
    lo: earliestBedtime,
    shift,
    bn: bedtimeEntry,
    avgN: nightLength,
    napDone: napTimeToday,
  } = plan;
  // "Next nap in …" / "Bedtime in …" under the ring (only while awake)
  let nextLine = '';
  if (plan.next) {
    const { label, t } = plan.next,
      d = Math.round(t - nowMin);
    nextLine = d > -1 ? `${label} at <b>~${clockTime(t)}</b>` : `${label} was due <b>~${clockTime(t)}</b>`;
  }

  awakeSpanLabel = '';
  let heroTime = '',
    heroAwake = '',
    ringSvg = '',
    nightLook = false,
    heroLabel = '',
    heroBig = '',
    heroSmall = '',
    napTimeLine = '',
    buttonsHtml = '',
    oneButton = false,
    isEmpty = false,
    rowsHtml = '',
    footHtml = '',
    planTitle = "Today's plan",
    showAddRow = true;

  if (running && running.type === 'night') {
    // the ring becomes a loading ring for the expected night: the average of the nights in the last 8 days
    nightLook = true;
    showAddRow = false;
    planTitle = 'Tonight';
    oneButton = true;
    redrawRing = null;
    ringNaps = null;
    const asleepMin = (nowMs - running.start) / 6e4,
      left = nightLength - asleepMin,
      angleOf = (m) => RING_START + RING_SWEEP * Math.min(1, Math.max(0, m / nightLength)),
      wakeT = running.start + nightLength * 6e4;
    const ppm = (RING_RADIUS * RING_SWEEP * Math.PI) / 180 / nightLength;
    ringSvg =
      RING_DEFS +
      ringLine(angleOf(0), angleOf(nightLength), '#171A45', 22) +
      (asleepMin > 0.5 ? ringLine(angleOf(0), angleOf(Math.min(asleepMin, nightLength)), 'url(#cool)', 22) : '') +
      (asleepMin * ppm > 30 && left * ppm > 30 ? nowLabel(angleOf(asleepMin), clockTime(minuteOfDay(nowMs))) : '') +
      `<g class="hit"${tapAction('edit', { id: running.id })}>${ringDisc(angleOf(0), moonIcon, '#B9B4FF', false)}</g>` +
      ringDisc(angleOf(nightLength), sunIcon, '#FFB547', true) +
      labelBelow(angleOf(0), clockTime(minuteOfDay(running.start)), '#ECE9FF') +
      labelBelow(angleOf(nightLength), '~' + clockTime(minuteOfDay(wakeT)), '#A6A9DA');
    heroLabel = 'Asleep for';
    heroBig = duration(asleepMin);
    heroSmall = 'since ' + clockTime(minuteOfDay(running.start));
    nextLine =
      left > 0
        ? `Expected wake-up in <b>${duration(left)}</b> <span class="mu">~${clockTime(minuteOfDay(wakeT))}</span>`
        : '<span class="mu">Past the usual wake-up time</span>';
    const nd = todaysNaps.filter((e) => e.end).reduce((x, e) => x + (e.end - e.start) / 6e4, 0);
    napTimeLine = nd > 0 ? 'Naps today: ' + duration(nd) : '';
    buttonsHtml = `<button${tapAction('stop', { id: running.id })}>Wake up</button>`;
    if (wokeThisMorning)
      rowsHtml += planRow(
        ROW_ICONS.sun,
        '',
        'Wake-up',
        `<b>${clockTime(minuteOfDay(wokeThisMorning.end))}</b>`,
        tapAction('edit', { id: wokeThisMorning.id }),
        'w',
      );
    todaysNaps
      .filter((e) => e.end)
      .forEach(
        (e, i) =>
          (rowsHtml += planRow(
            ROW_ICONS.check,
            '',
            'Nap ' + (i + 1),
            `<b>${clockTime(minuteOfDay(e.start))}–${clockTime(minuteOfDay(e.end))}</b> &nbsp;${duration((e.end - e.start) / 6e4)}`,
            tapAction('edit', { id: e.id }),
          )),
      );
    // bedtime and expected wake-up, joined on the right by a faint line with the expected night length on it
    rowsHtml += planRow(
      ROW_ICONS.moon,
      '',
      'Bedtime',
      `<b class="tc">${clockTime(minuteOfDay(running.start))}</b>`,
      tapAction('edit', { id: running.id }),
      'b',
    );
    awakeSpanLabel =
      wokeThisMorning && running.start > wokeThisMorning.end
        ? duration((running.start - wokeThisMorning.end) / 6e4)
        : '';
    rowsHtml += `<div class="span2"><span>~${duration(nightLength)}</span></div>`;
    rowsHtml += planRow(ROW_ICONS.sunA, 'bd', 'Wake-up', `<b class="tc">~${clockTime(minuteOfDay(wakeT))}</b>`);
    footHtml = 'Based on the nights of the past 8 days<br>Tap a row to edit';
  } else {
    let ringFrom = wakeUp != null ? wakeUp : 420,
      ringTo = bedtimeEntry ? minuteOfDay(bedtimeEntry.start) : bedtime != null ? bedtime : targetBedtime;
    const napRows = rows.filter((r) => !r.nodata);
    napRows.forEach((r) => {
      ringFrom = Math.min(ringFrom, r.s);
      ringTo = Math.max(ringTo, r.e);
    });
    if (ringTo < ringFrom + 240) ringTo = ringFrom + 240;
    const angleOf = (m) => RING_START + RING_SWEEP * Math.min(1, Math.max(0, (m - ringFrom) / (ringTo - ringFrom))),
      ppm = (RING_RADIUS * RING_SWEEP * Math.PI) / 180 / (ringTo - ringFrom);
    // the ring is drawn from the nap rows, so it can also be redrawn with in-between rows while the plan animates
    const drawRing = (naps, labels) => {
      const tail = () => {
        // "now" is always marked: a small amber dot at the end of the elapsed band (even when its time label has no room)
        let t = '';
        if (!running && nowMin > ringFrom && nowMin < ringTo) {
          const p = ringPoint(RING_RADIUS, angleOf(nowMin));
          t += `<circle cx="${round1(p[0])}" cy="${round1(p[1])}" r="7" fill="#FFB547" stroke="#1F2358" stroke-width="3"/>`;
        }
        t +=
          hit(
            wokeThisMorning ? tapAction('edit', { id: wokeThisMorning.id }) : tapAction('log-wake'),
            ringDisc(angleOf(ringFrom), sunIcon, '#FFB547', !wokeThisMorning),
          ) +
          hit(
            bedtimeEntry ? tapAction('edit', { id: bedtimeEntry.id }) : tapAction('add', { type: 'night' }),
            ringDisc(angleOf(ringTo), moonIcon, '#FFB547', !bedtimeEntry),
          ) +
          labelBelow(
            angleOf(ringFrom),
            (wokeThisMorning ? '' : '~') + clockTime(ringFrom),
            wokeThisMorning ? '#ECE9FF' : '#A6A9DA',
          ) +
          labelBelow(
            angleOf(ringTo),
            (bedtimeEntry ? '' : '~') + clockTime(ringTo),
            bedtimeEntry ? '#ECE9FF' : '#A6A9DA',
          );
        return t;
      };
      let svg =
        RING_DEFS +
        ringLine(angleOf(ringFrom), angleOf(ringTo), '#171A45', 22) +
        (nowMin > ringFrom ? ringLine(angleOf(ringFrom), angleOf(Math.min(nowMin, ringTo)), '#343A8C', 22) : '');
      // tapping a nap, the sun or the moon on the ring opens the same edit box as its row in the plan
      const hit = (action, inner) => (action ? `<g class="hit"${action}>${inner}</g>` : inner);
      naps.forEach((r) => {
        const ck = r.a ? tapAction('edit', { id: r.a.id }) : '';
        // a suggested extra nap: tap to add it
        if (r.extra) {
          svg += hit(tapAction('extra-more'), extraNapBubble(angleOf(r.s), angleOf(r.e)));
          return;
        }
        // a nap in progress: a dotted outline over its whole expected length, with the filled bubble growing inside it
        if (r.a && !r.a.end)
          svg += hit(
            ck,
            ringCapsule(
              angleOf(r.s),
              angleOf(Math.max(r.e, nowMin)),
              BAR_HALF,
              ' fill="#1F2358" stroke="#9C96F2" stroke-width="2.2" stroke-dasharray="3 4" stroke-linecap="round"',
            ) + napBar(angleOf(r.s), angleOf(Math.max(nowMin, r.s)), false),
          );
        else svg += hit(ck, napBar(angleOf(r.s), angleOf(r.e), !r.a));
      });
      // expected start and end times of the naps still to come, written along the ring just outside each bar.
      // A label is skipped when it would collide with another label or with the sun/moon discs (nap times win over "now").
      if (!labels) return svg + tail();
      const LR = RING_RADIUS + BAR_HALF + 13,
        blk = [
          [angleOf(ringFrom), 34],
          [angleOf(ringTo), 34],
        ],
        room = (t) => blk.every(([q, g]) => ((Math.abs(q - t) * Math.PI) / 180) * LR >= g);
      // the target end of the nap in progress
      if (plan.cur && plan.cur.end > nowMin && plan.cur.end < ringTo) {
        const t = angleOf(plan.cur.end);
        if (room(t)) {
          svg += labelAlongRing(t, clockTime(plan.cur.end));
          blk.push([t, 40]);
        }
      }
      naps
        .filter((r) => !r.a)
        .forEach((r) =>
          [r.s, r.e].forEach((m) => {
            const t = angleOf(m);
            if (m > ringFrom && m < ringTo && room(t)) {
              svg += labelAlongRing(t, clockTime(m));
              blk.push([t, 40]);
            }
          }),
        );
      if (nowMin > ringFrom && nowMin < ringTo && room(angleOf(nowMin)))
        svg += nowLabel(angleOf(nowMin), clockTime(nowMin));
      return svg + tail();
    };
    ringSvg = drawRing(napRows, true);
    redrawRing = (r) => drawRing(r, false);
    ringNaps = napRows;
    if (running) {
      nightLook = true;
      oneButton = true;
      heroLabel = 'Asleep for';
      heroBig = duration((nowMs - running.start) / 6e4);
      heroSmall = 'since ' + clockTime(minuteOfDay(running.start)) + ' · nap ' + (todaysNaps.indexOf(running) + 1);
      // the nap's target (what is left of the day's nap-time goal): time left until it, or how far past it she is
      if (plan.cur) {
        const d = Math.round(plan.cur.end - nowMin),
          mn = (x) => (x < 60 ? x + ' min' : duration(x));
        heroTime = d > 0 ? 'target +' + mn(d) : 'past target by ' + mn(-d);
      }
      buttonsHtml = `<button${tapAction('stop', { id: running.id })}>End nap</button>`;
    } else {
      const last = entries.filter((e) => e.end).sort((x, y) => y.end - x.end)[0];
      if (last) {
        heroLabel = 'Awake for';
        heroBig = duration((nowMs - last.end) / 6e4);
        heroSmall =
          'since ' +
          clockTime(minuteOfDay(last.end)) +
          (last.type === 'nap' && todaysNaps.includes(last)
            ? ', after nap ' + (todaysNaps.indexOf(last) + 1)
            : last.type === 'night'
              ? ', after night sleep'
              : '');
      } else {
        heroBig = 'No entries yet';
        isEmpty = true;
      }
      // with a next nap or bedtime, the countdown takes the middle and the awake time moves underneath, smaller
      if (last && plan.next) {
        const { label, t } = plan.next,
          d = Math.round(t - nowMin);
        heroAwake = heroLabel + ' ' + heroBig;
        heroTime = 'at ~' + clockTime(t);
        heroLabel = d > 0 ? label + ' in' : d > -1 ? label : label + ' overdue by';
        heroBig = d > 0 ? duration(d) : d > -1 ? 'now' : duration(-d);
        nextLine = ''; // the expected time now sits in the ring, under the countdown
      }
      // once today's target naps (plus any added extra naps) are done, Start night becomes the main button; same places
      const napsDone = todaysNaps.filter((e) => e.end).length >= settings.targetNaps + extraNapsToday();
      buttonsHtml = `<button${napsDone ? ' class="alt"' : ''}${tapAction('start', { type: 'nap' })}><span class="zz">💤</span>Start nap</button><button${napsDone ? '' : ' class="alt"'}${tapAction('start', { type: 'night' })}>Start night</button>`;
    }
    napTimeLine = napTarget != null ? `Nap time today: ${duration(napTimeToday)} of about ${duration(napTarget)}` : '';

    rowsHtml += wokeThisMorning
      ? planRow(
          ROW_ICONS.sun,
          '',
          'Wake-up',
          `<b>${clockTime(wakeUp)}</b>`,
          tapAction('edit', { id: wokeThisMorning.id }),
        )
      : planRow(
          ROW_ICONS.sunA,
          'bd',
          'Wake-up',
          wakeUp != null ? `<b>~${clockTime(wakeUp)}</b><br>not logged · tap to set` : 'tap to log',
          tapAction('log-wake'),
        );
    rows.forEach((r) => {
      if (r.nodata) {
        rowsHtml += planRow('', 'nd0', 'Nap ' + r.n, 'no data yet');
        return;
      }
      const x = r.a,
        aw = r.aw != null ? `<br>awake ${duration(r.aw)} first` : '';
      if (x)
        rowsHtml += planRow(
          ROW_ICONS.check,
          '',
          'Nap ' + r.n,
          `<b>${clockTime(r.s)}–${x.end ? clockTime(r.e) : 'now'}</b> &nbsp;${duration((x.end ? r.e : nowMin) - r.s)}${!x.end && plan.cur ? '<br>target ' + duration(plan.cur.len) + ' (~' + clockTime(plan.cur.end) + ')' : ''}${aw}`,
          tapAction('edit', { id: x.id }),
        );
      else if (r.extra)
        rowsHtml += planRow(
          '',
          'bd',
          'Extra nap?',
          `<b>~${clockTime(r.s)}–${clockTime(r.e)}</b> &nbsp;${duration(r.e - r.s)}<br>short naps today <span class="pill">＋ Add</span>`,
          tapAction('extra-more'),
        );
      else
        rowsHtml += planRow(
          '',
          'bd',
          'Nap ' + r.n,
          `<b>~${clockTime(r.s)}–${clockTime(r.e)}</b> &nbsp;${duration(r.e - r.s)}${r.add >= 5 ? ' (+' + duration(r.add) + ')' : ''}${aw}${r.from ? `<br>no nap ${r.n} lately, based on nap ${r.from}` : ''}`,
        );
    });
    if (bedtimeEntry)
      rowsHtml += planRow(
        ROW_ICONS.moon,
        '',
        'Bedtime',
        `<b>${clockTime(minuteOfDay(bedtimeEntry.start))}</b><br>target ${settings.bedtime}`,
        tapAction('edit', { id: bedtimeEntry.id }),
      );
    else {
      const dev = bedtime != null ? Math.round(bedtime - targetBedtime) : 0;
      const t =
        bedtime != null
          ? `<b>~${clockTime(bedtime)}</b><br>${dev === 0 ? 'on target' : 'target ' + settings.bedtime + ' (' + (dev > 0 ? '+' : '−') + duration(Math.abs(dev)) + ')'} · awake&nbsp;${duration(bedtime - plan.last)}`
          : `<b>target ${settings.bedtime}</b>`;
      rowsHtml += planRow(ROW_ICONS.moonA, 'bd', 'Bedtime', t, tapAction('add', { type: 'night' }));
      if (bedtime != null && bedtime < earliestBedtime - 1)
        footHtml +=
          '⚠ Not enough naps to stay under 3h 30m awake until your target bedtime. Consider adding a nap.<br>';
    }
    if (shift && !bedtimeEntry)
      footHtml += `Naps moved ${duration(Math.abs(shift))} ${shift > 0 ? 'later' : 'earlier'} than usual to fit bedtime<br>`;
    footHtml += 'Based on the past 7 days<br>Tap a row to edit';
  }

  const hero = $('#hero');
  hero.className = 'hero' + (isEmpty ? ' empty' : '');
  hero.innerHTML = `<div class="glow${nightLook ? ' cool' : ''}"></div><svg class="ring" viewBox="-20 -20 340 350" aria-hidden="true">${ringSvg}</svg><div class="in"><div class="k">${heroLabel}</div><div class="big">${heroBig}</div>${heroTime ? `<div class="at">${heroTime}</div>` : ''}${heroAwake ? `<div class="aw">${heroAwake}</div>` : ''}<div class="s">${heroSmall}</div></div>`;
  $('#nextev').innerHTML = nextLine;
  $('#nextev').hidden = !nextLine;
  $('#sub2').textContent = napTimeLine;
  const nb = $('#nowbtns');
  nb.className = 'nowbtns' + (oneButton ? ' one' : '');
  nb.innerHTML = buttonsHtml;
  $('#plantitle').textContent = planTitle;
  $('#plan').innerHTML = rowsHtml;
  $('#planfoot').innerHTML = `<div class="foot">${footHtml}</div>`;
  drawAwakeSpan();
  $('#addnap').hidden = !showAddRow;
  $('#xless').hidden = !extraNapsToday();
  syncReminder(plan.want);
  if (pendingAnimation && Date.now() - pendingAnimation.t < 4000) {
    const p = pendingAnimation;
    pendingAnimation = null;
    animatePlan(p.before, p.list);
  } else markChangedRows(); // a redraw during the animation keeps the glow on the changed rows

  renderHistory();
  renderStats();
}
