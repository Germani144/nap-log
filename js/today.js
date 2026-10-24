// The Today tab: the ring, the countdown, the buttons and today's plan, plus the plan animation.

let ringDraw = null,
  ringRows = null;
// what each plan row says, to see which rows changed after the plan was rearranged
const planSnap = () =>
  Object.fromEntries(
    [...document.querySelectorAll('#plan .it')].map((el) => [
      el.querySelector('.t').textContent,
      el.querySelector('.r').textContent,
    ]),
  );
// after adding an extra nap or editing an entry: the ring morphs from the old plan to the new one (naps shrink, slide,
// appear) and in the list new rows slide in while rows whose times changed briefly glow. The animation reads the current
// ring element and rows on every frame, so it survives the extra redraws that arrive from the database in shared mode.
let anim = null;
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// rows redrawn mid-animation continue where they were (negative delay) instead of starting over, so nothing flickers
function markRows() {
  if (!anim) return;
  const el0 = performance.now() - anim.t0;
  document.querySelectorAll('#plan .it').forEach((el) => {
    const k = el.querySelector('.t').textContent,
      b = el.querySelector('.r b');
    if (!(k in anim.list)) {
      if (el0 < 600) {
        el.classList.add('enter');
        el.style.animationDelay = -el0 + 'ms';
      }
    } else if (anim.list[k] !== el.querySelector('.r').textContent && el0 < 1600) {
      el.classList.add('flash');
      if (b) b.style.animationDelay = -el0 + 'ms';
    }
  });
}
function animatePlan(before, beforeList) {
  if (reduceMotion()) return;
  anim = { before, list: beforeList, t0: performance.now() };
  markRows();
  if (!ringDraw || !before) return;
  const old = {};
  before.forEach((r) => {
    old[r.n] = r;
  });
  const D = 700;
  const step = (now) => {
    if (!anim) return;
    let t = Math.min(1, (now - anim.t0) / D);
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const svgEl = $('#hero svg.ring');
    if (svgEl && ringDraw && ringRows && t < 1) {
      const rows = ringRows.map((r) => {
        const o = old[r.n];
        if (o) return { ...r, s: o.s + (r.s - o.s) * k, e: o.e + (r.e - o.e) * k };
        const m = (r.s + r.e) / 2,
          h = ((r.e - r.s) / 2) * k;
        return { ...r, s: m - h, e: m + h };
      });
      svgEl.innerHTML = ringDraw(rows);
      requestAnimationFrame(step);
    } else {
      animRing = false;
      render();
    } // done: one normal redraw puts the labels back
  };
  animRing = true;
  requestAnimationFrame(step);
}
let animRing = false;
// changes made by hand (adding an extra nap, editing or deleting an entry) animate the plan on the next render.
// In shared mode that render comes a moment later, when the change arrives back from the database.
let pendingAnim = null;
const markAnim = () => {
  pendingAnim = { before: ringRows, list: planSnap(), t: Date.now() };
};

// The day's awake time (this morning's wake-up to bedtime), shown at night as a faint bracket joining those two rows.
// It is drawn after the rows are on screen because it needs their positions.
let daySpan = '';
function drawDaySpan() {
  const pl = $('#plan');
  pl.querySelector('.dayspan')?.remove();
  const a = pl.querySelector('[data-k=w]'),
    b = pl.querySelector('[data-k=b]');
  if (!daySpan || !a || !b || !a.offsetHeight) return;
  const y1 = a.offsetTop + 21,
    y2 = b.offsetTop + 21,
    d = document.createElement('div');
  d.className = 'dayspan';
  d.style.top = y1 + 'px';
  d.style.height = y2 - y1 + 'px';
  d.innerHTML = `<span>${daySpan}</span>`;
  pl.appendChild(d);
}
// ---------- rendering ----------
function render() {
  const pl = makePlan(entries, Date.now(), planSettings());
  const { now: nowT, today, nowM, run, we, wk0, T, tn, rows, B, bt, lo, shift, bn, avgN, napDone } = pl;
  // "Next nap in …" / "Bedtime in …" under the ring (only while awake)
  let nx = '';
  if (pl.next) {
    const { label, t } = pl.next,
      d = Math.round(t - nowM);
    nx = d > -1 ? `${label} at <b>~${hm(t)}</b>` : `${label} was due <b>~${hm(t)}</b>`;
  }

  daySpan = '';
  let at = '',
    awl = '',
    svg = '',
    cool = false,
    k = '',
    big = '',
    small = '',
    sub = '',
    btns = '',
    one = false,
    empty = false,
    tl = '',
    foot = '',
    title = "Today's plan",
    showAdd = true;

  if (run && run.type === 'night') {
    // the ring becomes a loading ring for the expected night: the average of the nights in the last 8 days
    cool = true;
    showAdd = false;
    title = 'Tonight';
    one = true;
    ringDraw = null;
    ringRows = null;
    const el = (nowT - run.start) / 6e4,
      left = avgN - el,
      th = (m) => GST + GSW * Math.min(1, Math.max(0, m / avgN)),
      wakeT = run.start + avgN * 6e4;
    const ppm = (GR * GSW * Math.PI) / 180 / avgN;
    svg =
      GDEFS +
      gline(th(0), th(avgN), '#171A45', 22) +
      (el > 0.5 ? gline(th(0), th(Math.min(el, avgN)), 'url(#cool)', 22) : '') +
      (el * ppm > 30 && left * ppm > 30 ? gnow(th(el), hm(tod(nowT))) : '') +
      `<g class="hit"${act('edit', { id: run.id })}>${gdisc(th(0), gmoon, '#B9B4FF', false)}</g>` +
      gdisc(th(avgN), gsun, '#FFB547', true) +
      gunder(th(0), hm(tod(run.start)), '#ECE9FF') +
      gunder(th(avgN), '~' + hm(tod(wakeT)), '#A6A9DA');
    k = 'Asleep for';
    big = dur(el);
    small = 'since ' + hm(tod(run.start));
    nx =
      left > 0
        ? `Expected wake-up in <b>${dur(left)}</b> <span class="mu">~${hm(tod(wakeT))}</span>`
        : '<span class="mu">Past the usual wake-up time</span>';
    const nd = tn.filter((e) => e.end).reduce((x, e) => x + (e.end - e.start) / 6e4, 0);
    sub = nd > 0 ? 'Naps today: ' + dur(nd) : '';
    btns = `<button${act('stop', { id: run.id })}>Wake up</button>`;
    if (we) tl += tlRow(IC.sun, '', 'Wake-up', `<b>${hm(tod(we.end))}</b>`, act('edit', { id: we.id }), 'w');
    tn.filter((e) => e.end).forEach(
      (e, i) =>
        (tl += tlRow(
          IC.check,
          '',
          'Nap ' + (i + 1),
          `<b>${hm(tod(e.start))}–${hm(tod(e.end))}</b> &nbsp;${dur((e.end - e.start) / 6e4)}`,
          act('edit', { id: e.id }),
        )),
    );
    // bedtime and expected wake-up, joined on the right by a faint line with the expected night length on it
    tl += tlRow(IC.moon, '', 'Bedtime', `<b class="tc">${hm(tod(run.start))}</b>`, act('edit', { id: run.id }), 'b');
    daySpan = we && run.start > we.end ? dur((run.start - we.end) / 6e4) : '';
    tl += `<div class="span2"><span>~${dur(avgN)}</span></div>`;
    tl += tlRow(IC.sunA, 'bd', 'Wake-up', `<b class="tc">~${hm(tod(wakeT))}</b>`);
    foot = 'Based on the nights of the past 8 days<br>Tap a row to edit';
  } else {
    let a = wk0 != null ? wk0 : 420,
      b = bn ? tod(bn.start) : B != null ? B : bt;
    const sp = rows.filter((r) => !r.nodata);
    sp.forEach((r) => {
      a = Math.min(a, r.s);
      b = Math.max(b, r.e);
    });
    if (b < a + 240) b = a + 240;
    const th = (m) => GST + GSW * Math.min(1, Math.max(0, (m - a) / (b - a))),
      ppm = (GR * GSW * Math.PI) / 180 / (b - a);
    // the ring is drawn from the nap rows, so it can also be redrawn with in-between rows while the plan animates
    const ringOf = (sp, labels) => {
      const tail = () => {
        // "now" is always marked: a small amber dot at the end of the elapsed band (even when its time label has no room)
        let t = '';
        if (!run && nowM > a && nowM < b) {
          const p = gpt(GR, th(nowM));
          t += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="7" fill="#FFB547" stroke="#1F2358" stroke-width="3"/>`;
        }
        t +=
          hit(we ? act('edit', { id: we.id }) : act('log-wake'), gdisc(th(a), gsun, '#FFB547', !we)) +
          hit(bn ? act('edit', { id: bn.id }) : act('add', { type: 'night' }), gdisc(th(b), gmoon, '#FFB547', !bn)) +
          gunder(th(a), (we ? '' : '~') + hm(a), we ? '#ECE9FF' : '#A6A9DA') +
          gunder(th(b), (bn ? '' : '~') + hm(b), bn ? '#ECE9FF' : '#A6A9DA');
        return t;
      };
      let svg =
        GDEFS +
        gline(th(a), th(b), '#171A45', 22) +
        (nowM > a ? gline(th(a), th(Math.min(nowM, b)), '#343A8C', 22) : '');
      // tapping a nap, the sun or the moon on the ring opens the same edit box as its row in the plan
      const hit = (action, inner) => (action ? `<g class="hit"${action}>${inner}</g>` : inner);
      sp.forEach((r) => {
        const ck = r.a ? act('edit', { id: r.a.id }) : '';
        // a nap in progress: a dotted outline over its whole expected length, with the filled bubble growing inside it
        if (r.extra) {
          svg += hit(act('extra-more'), gextra(th(r.s), th(r.e)));
          return;
        } // a suggested extra nap: tap to add it
        if (r.a && !r.a.end)
          svg += hit(
            ck,
            gshape(
              th(r.s),
              th(Math.max(r.e, nowM)),
              GHW,
              ' fill="#1F2358" stroke="#9C96F2" stroke-width="2.2" stroke-dasharray="3 4" stroke-linecap="round"',
            ) + gcap(th(r.s), th(Math.max(nowM, r.s)), false),
          );
        else svg += hit(ck, gcap(th(r.s), th(r.e), !r.a));
      });
      // expected start and end times of the naps still to come, written along the ring just outside each bar.
      // A label is skipped when it would collide with another label or with the sun/moon discs (nap times win over "now").
      if (!labels) return svg + tail();
      const LR = GR + GHW + 13,
        blk = [
          [th(a), 34],
          [th(b), 34],
        ],
        room = (t) => blk.every(([q, g]) => ((Math.abs(q - t) * Math.PI) / 180) * LR >= g);
      if (pl.cur && pl.cur.end > nowM && pl.cur.end < b) {
        const t = th(pl.cur.end);
        if (room(t)) {
          svg += gtan(t, hm(pl.cur.end));
          blk.push([t, 40]);
        }
      } // target end of the nap in progress
      sp.filter((r) => !r.a).forEach((r) =>
        [r.s, r.e].forEach((m) => {
          const t = th(m);
          if (m > a && m < b && room(t)) {
            svg += gtan(t, hm(m));
            blk.push([t, 40]);
          }
        }),
      );
      if (nowM > a && nowM < b && room(th(nowM))) svg += gnow(th(nowM), hm(nowM));
      return svg + tail();
    };
    svg = ringOf(sp, true);
    ringDraw = (r) => ringOf(r, false);
    ringRows = sp;
    if (run) {
      cool = true;
      one = true;
      k = 'Asleep for';
      big = dur((nowT - run.start) / 6e4);
      small = 'since ' + hm(tod(run.start)) + ' · nap ' + (tn.indexOf(run) + 1);
      // the nap's target (what is left of the day's nap-time goal): time left until it, or how far past it she is
      if (pl.cur) {
        const d = Math.round(pl.cur.end - nowM),
          mn = (x) => (x < 60 ? x + ' min' : dur(x));
        at = d > 0 ? 'target +' + mn(d) : 'past target by ' + mn(-d);
      }
      btns = `<button${act('stop', { id: run.id })}>End nap</button>`;
    } else {
      const last = entries.filter((e) => e.end).sort((x, y) => y.end - x.end)[0];
      if (last) {
        k = 'Awake for';
        big = dur((nowT - last.end) / 6e4);
        small =
          'since ' +
          hm(tod(last.end)) +
          (last.type === 'nap' && tn.includes(last)
            ? ', after nap ' + (tn.indexOf(last) + 1)
            : last.type === 'night'
              ? ', after night sleep'
              : '');
      } else {
        big = 'No entries yet';
        empty = true;
      }
      // with a next nap or bedtime, the countdown takes the middle and the awake time moves underneath, smaller
      if (last && pl.next) {
        const { label, t } = pl.next,
          d = Math.round(t - nowM);
        awl = k + ' ' + big;
        at = 'at ~' + hm(t);
        k = d > 0 ? label + ' in' : d > -1 ? label : label + ' overdue by';
        big = d > 0 ? dur(d) : d > -1 ? 'now' : dur(-d);
        nx = ''; // the expected time now sits in the ring, under the countdown
      }
      // once today's target naps (plus any added extra naps) are done, Start night becomes the main button; same places
      const napsDone = tn.filter((e) => e.end).length >= settings.targetNaps + extraToday();
      btns = `<button${napsDone ? ' class="alt"' : ''}${act('start', { type: 'nap' })}><span class="zz">💤</span>Start nap</button><button${napsDone ? '' : ' class="alt"'}${act('start', { type: 'night' })}>Start night</button>`;
    }
    sub = T != null ? `Nap time today: ${dur(napDone)} of about ${dur(T)}` : '';

    tl += we
      ? tlRow(IC.sun, '', 'Wake-up', `<b>${hm(wk0)}</b>`, act('edit', { id: we.id }))
      : tlRow(
          IC.sunA,
          'bd',
          'Wake-up',
          wk0 != null ? `<b>~${hm(wk0)}</b><br>not logged · tap to set` : 'tap to log',
          act('log-wake'),
        );
    rows.forEach((r) => {
      if (r.nodata) {
        tl += tlRow('', 'nd0', 'Nap ' + r.n, 'no data yet');
        return;
      }
      const x = r.a,
        aw = r.aw != null ? `<br>awake ${dur(r.aw)} first` : '';
      if (x)
        tl += tlRow(
          IC.check,
          '',
          'Nap ' + r.n,
          `<b>${hm(r.s)}–${x.end ? hm(r.e) : 'now'}</b> &nbsp;${dur((x.end ? r.e : nowM) - r.s)}${!x.end && pl.cur ? '<br>target ' + dur(pl.cur.len) + ' (~' + hm(pl.cur.end) + ')' : ''}${aw}`,
          act('edit', { id: x.id }),
        );
      else if (r.extra)
        tl += tlRow(
          '',
          'bd',
          'Extra nap?',
          `<b>~${hm(r.s)}–${hm(r.e)}</b> &nbsp;${dur(r.e - r.s)}<br>short naps today <span class="pill">＋ Add</span>`,
          act('extra-more'),
        );
      else
        tl += tlRow(
          '',
          'bd',
          'Nap ' + r.n,
          `<b>~${hm(r.s)}–${hm(r.e)}</b> &nbsp;${dur(r.e - r.s)}${r.add >= 5 ? ' (+' + dur(r.add) + ')' : ''}${aw}${r.from ? `<br>no nap ${r.n} lately, based on nap ${r.from}` : ''}`,
        );
    });
    if (bn)
      tl += tlRow(
        IC.moon,
        '',
        'Bedtime',
        `<b>${hm(tod(bn.start))}</b><br>target ${settings.bedtime}`,
        act('edit', { id: bn.id }),
      );
    else {
      const dev = B != null ? Math.round(B - bt) : 0;
      const t =
        B != null
          ? `<b>~${hm(B)}</b><br>${dev === 0 ? 'on target' : 'target ' + settings.bedtime + ' (' + (dev > 0 ? '+' : '−') + dur(Math.abs(dev)) + ')'} · awake&nbsp;${dur(B - pl.last)}`
          : `<b>target ${settings.bedtime}</b>`;
      tl += tlRow(IC.moonA, 'bd', 'Bedtime', t, act('add', { type: 'night' }));
      if (B != null && B < lo - 1)
        foot += '⚠ Not enough naps to stay under 3h 30m awake until your target bedtime. Consider adding a nap.<br>';
    }
    if (shift && !bn)
      foot += `Naps moved ${dur(Math.abs(shift))} ${shift > 0 ? 'later' : 'earlier'} than usual to fit bedtime<br>`;
    foot += 'Based on the past 7 days<br>Tap a row to edit';
  }

  const hero = $('#hero');
  hero.className = 'hero' + (empty ? ' empty' : '');
  hero.innerHTML = `<div class="glow${cool ? ' cool' : ''}"></div><svg class="ring" viewBox="-20 -20 340 350" aria-hidden="true">${svg}</svg><div class="in"><div class="k">${k}</div><div class="big">${big}</div>${at ? `<div class="at">${at}</div>` : ''}${awl ? `<div class="aw">${awl}</div>` : ''}<div class="s">${small}</div></div>`;
  $('#nextev').innerHTML = nx;
  $('#nextev').hidden = !nx;
  $('#sub2').textContent = sub;
  const nb = $('#nowbtns');
  nb.className = 'nowbtns' + (one ? ' one' : '');
  nb.innerHTML = btns;
  $('#plantitle').textContent = title;
  $('#plan').innerHTML = tl;
  $('#planfoot').innerHTML = `<div class="foot">${foot}</div>`;
  drawDaySpan();
  $('#addnap').hidden = !showAdd;
  $('#xless').hidden = !extraToday();
  syncNotify(pl.want);
  if (pendingAnim && Date.now() - pendingAnim.t < 4000) {
    const p = pendingAnim;
    pendingAnim = null;
    animatePlan(p.before, p.list);
  } else markRows(); // a redraw during the animation keeps the glow on the changed rows

  renderHistory();
  renderStats();
}
