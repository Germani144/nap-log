// The History tab: the month calendar and the selected day.

// ---------- history tab ----------
const loadedM = new Set();
let histNote = '';

// shared mode: fetch the part of the viewed month that is older than the live sync window (once per month)
function ensureMonth() {
  if (!db) return;
  const from = +viewM,
    to = +new Date(viewM.getFullYear(), viewM.getMonth() + 1, 1),
    upto = Math.min(to, sod(Date.now()) - 14 * DAY);
  if (upto <= from || loadedM.has(from)) return;
  loadedM.add(from);
  fam()
    .collection('entries')
    .where('start', '>=', from - DAY)
    .where('start', '<', upto)
    .get()
    .then((q) => {
      q.docs.forEach((d) => {
        const e = d.data();
        if (okE(e)) hist[e.id] = e;
      });
      histNote = q.size ? '' : 'No older entries found in the shared log for this month.';
      renderHistory();
    })
    .catch((e) => {
      loadedM.delete(from);
      histNote = 'Could not load older days: ' + esc((e && e.message) || e);
      renderHistory();
    });
}
function showMonth(y, m) {
  viewM = new Date(y, m, 1);
  const n = new Date();
  selDay = viewM.getFullYear() === n.getFullYear() && viewM.getMonth() === n.getMonth() ? sod(Date.now()) : +viewM;
  ensureMonth();
  renderHistory();
}
function pickDay(t) {
  selDay = t;
  renderHistory();
}
function renderHistory() {
  if (tab !== 'hist') return;
  const y = viewM.getFullYear(),
    m = viewM.getMonth(),
    lead = (new Date(y, m, 1).getDay() + 6) % 7,
    dim = new Date(y, m + 1, 0).getDate(),
    all = allE(),
    has = new Set(),
    today = sod(Date.now()),
    now = new Date();
  all.forEach((e) => {
    has.add(sod(e.start));
    if (e.type === 'night' && e.end) has.add(sod(e.end));
  });
  const tot = {};
  all.forEach((e) => {
    if (e.type === 'nap' && e.end) tot[sod(e.start)] = (tot[sod(e.start)] || 0) + (e.end - e.start) / 6e4;
  });
  let c =
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((x) => `<div class="h">${x}</div>`).join('') +
    '<span></span>'.repeat(lead);
  for (let d = 1; d <= dim; d++) {
    const t = +new Date(y, m, d),
      v = tot[t],
      bar =
        v && t < today
          ? `<u style="height:${Math.round(Math.min(12, Math.max(4, ((v - 120) / 150) * 8 + 5)))}px"></u>`
          : '';
    c += `<button class="${[t === selDay ? 'sel' : '', t === today ? 'today' : '', has.has(t) ? 'dot' : ''].join(' ')}"${act('pick-day', { day: t })}>${d}${bar}</button>`;
  }
  $('#cal').innerHTML =
    `<div class="calhead"><button class="x" aria-label="Previous month"${act('month', { y, m: m - 1 })}>‹</button><b>${viewM.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><button class="x" aria-label="Next month"${act('month', { y, m: m + 1 })}>›</button></div><div class="cal">${c}</div><div class="leg">Each bar is that day's total nap time. <button class="lnk" style="padding:0;margin:0 0 0 8px"${act('month', { y: now.getFullYear(), m: now.getMonth() })}>Go to today</button></div>`;

  // selected day: wake-up (night that ended this day), naps, bedtime (night that started this day)
  const d = selDay,
    ns = all.filter((e) => e.type === 'nap' && sod(e.start) === d).sort((a, b) => a.start - b.start),
    wk = all.find((e) => e.type === 'night' && e.end && sod(e.end) === d),
    bd = all.find((e) => e.type === 'night' && sod(e.start) === d);
  let tl = '';
  if (wk)
    tl += tlRow(
      IC.sun,
      '',
      'Wake-up',
      `<b>${hm(tod(wk.end))}</b> &nbsp;slept ${dur((wk.end - wk.start) / 6e4)}`,
      act('edit', { id: wk.id }),
    );
  ns.forEach(
    (e, i) =>
      (tl += tlRow(
        IC.check,
        '',
        'Nap ' + (i + 1),
        e.end
          ? `<b>${hm(tod(e.start))}–${hm(tod(e.end))}</b> &nbsp;${dur((e.end - e.start) / 6e4)}`
          : `<b>${hm(tod(e.start))}</b> &nbsp;ongoing`,
        act('edit', { id: e.id }),
      )),
  );
  if (bd)
    tl += tlRow(
      IC.moon,
      '',
      'Bedtime',
      `<b>${hm(tod(bd.start))}</b>${bd.end ? '' : ' &nbsp;sleeping'}`,
      act('edit', { id: bd.id }),
    );
  const total = ns.filter((e) => e.end).reduce((s, e) => s + (e.end - e.start) / 6e4, 0);
  // 06:00-20:00 strip of the day
  const X = (mm) => Math.min(100, Math.max(0, ((mm - 360) / 840) * 100));
  let strip = '';
  if (tl) {
    strip = '<div class="strip"><div class="ax"></div>';
    ns.filter((e) => e.end).forEach((e) => {
      strip += `<div class="blk" style="left:${X(tod(e.start)).toFixed(2)}%;width:${Math.max(0.8, X(tod(e.end)) - X(tod(e.start))).toFixed(2)}%"></div>`;
    });
    if (bd)
      strip += `<div class="bed" style="left:${X(tod(bd.start)).toFixed(2)}%"><svg width="26" height="26" viewBox="0 0 20 20"><path d="M13.5 3a8 8 0 1 0 3.5 14 6.5 6.5 0 0 1-3.5-14z" fill="#9C96F2" stroke="#1F2358" stroke-width="1.2"/></svg></div>`;
    [6, 9, 12, 15, 18].forEach(
      (h) => (strip += `<span class="tick" style="left:${X(h * 60).toFixed(2)}%">${h}</span>`),
    );
    strip += '</div>';
  }
  let h = `<h2>${new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>`;
  if (tl)
    h += `<div class="sum">${ns.length ? ns.length + ' nap' + (ns.length > 1 ? 's' : '') + ', ' + dur(total) + ' in total' : 'No naps logged'}</div>${strip}<div class="tl">${tl}</div>`;
  else h += '<div class="sum">Nothing logged for this day</div>';
  h +=
    `<div class="addrow"><button class="lnk"${act('add', { type: 'nap', day: d })}>＋ Add nap</button>` +
    (bd ? '' : `<button class="lnk"${act('add', { type: 'night', day: d })}>＋ Log bedtime</button>`) +
    '</div>';
  if (histNote && d < today - 14 * DAY) h += `<div class="mu" style="margin-top:8px">${histNote}</div>`;
  $('#day').innerHTML = h;
}
