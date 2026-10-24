// The History tab: the month calendar and the selected day.

const loadedMonths = new Set();
let historyNote = '';

// shared mode: fetch the part of the viewed month that is older than the live sync window (once per month)
function loadShownMonth() {
  if (!db) return;
  const from = +shownMonth,
    to = +new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1),
    upto = Math.min(to, startOfDay(Date.now()) - 14 * DAY);
  if (upto <= from || loadedMonths.has(from)) return;
  loadedMonths.add(from);
  familyRef()
    .collection('entries')
    .where('start', '>=', from - DAY)
    .where('start', '<', upto)
    .get()
    .then((q) => {
      q.docs.forEach((d) => {
        const e = d.data();
        if (isValidEntry(e)) olderEntries[e.id] = e;
      });
      historyNote = q.size ? '' : 'No older entries found in the shared log for this month.';
      renderHistory();
    })
    .catch((e) => {
      loadedMonths.delete(from);
      historyNote = 'Could not load older days: ' + escapeHtml((e && e.message) || e);
      renderHistory();
    });
}
function showMonth(y, m) {
  shownMonth = new Date(y, m, 1);
  const n = new Date();
  selectedDay =
    shownMonth.getFullYear() === n.getFullYear() && shownMonth.getMonth() === n.getMonth()
      ? startOfDay(Date.now())
      : +shownMonth;
  loadShownMonth();
  renderHistory();
}
function pickDay(t) {
  selectedDay = t;
  renderHistory();
}
function renderHistory() {
  if (currentTab !== 'hist') return;
  const y = shownMonth.getFullYear(),
    m = shownMonth.getMonth(),
    lead = (new Date(y, m, 1).getDay() + 6) % 7,
    dim = new Date(y, m + 1, 0).getDate(),
    all = allEntries(),
    has = new Set(),
    today = startOfDay(Date.now()),
    now = new Date();
  all.forEach((e) => {
    has.add(startOfDay(e.start));
    if (e.type === 'night' && e.end) has.add(startOfDay(e.end));
  });
  const tot = {};
  all.forEach((e) => {
    if (e.type === 'nap' && e.end) tot[startOfDay(e.start)] = (tot[startOfDay(e.start)] || 0) + (e.end - e.start) / 6e4;
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
    c += `<button class="${[t === selectedDay ? 'sel' : '', t === today ? 'today' : '', has.has(t) ? 'dot' : ''].join(' ')}"${tapAction('pick-day', { day: t })}>${d}${bar}</button>`;
  }
  $('#cal').innerHTML =
    `<div class="calhead"><button class="x" aria-label="Previous month"${tapAction('month', { y, m: m - 1 })}>‹</button><b>${shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><button class="x" aria-label="Next month"${tapAction('month', { y, m: m + 1 })}>›</button></div><div class="cal">${c}</div><div class="leg">Each bar is that day's total nap time. <button class="lnk" style="padding:0;margin:0 0 0 8px"${tapAction('month', { y: now.getFullYear(), m: now.getMonth() })}>Go to today</button></div>`;

  // selected day: wake-up (night that ended this day), naps, bedtime (night that started this day)
  const d = selectedDay,
    ns = all.filter((e) => e.type === 'nap' && startOfDay(e.start) === d).sort((a, b) => a.start - b.start),
    wk = all.find((e) => e.type === 'night' && e.end && startOfDay(e.end) === d),
    bd = all.find((e) => e.type === 'night' && startOfDay(e.start) === d);
  let tl = '';
  if (wk)
    tl += planRow(
      ROW_ICONS.sun,
      '',
      'Wake-up',
      `<b>${clockTime(minuteOfDay(wk.end))}</b> &nbsp;slept ${duration((wk.end - wk.start) / 6e4)}`,
      tapAction('edit', { id: wk.id }),
    );
  ns.forEach(
    (e, i) =>
      (tl += planRow(
        ROW_ICONS.check,
        '',
        'Nap ' + (i + 1),
        e.end
          ? `<b>${clockTime(minuteOfDay(e.start))}–${clockTime(minuteOfDay(e.end))}</b> &nbsp;${duration((e.end - e.start) / 6e4)}`
          : `<b>${clockTime(minuteOfDay(e.start))}</b> &nbsp;ongoing`,
        tapAction('edit', { id: e.id }),
      )),
  );
  if (bd)
    tl += planRow(
      ROW_ICONS.moon,
      '',
      'Bedtime',
      `<b>${clockTime(minuteOfDay(bd.start))}</b>${bd.end ? '' : ' &nbsp;sleeping'}`,
      tapAction('edit', { id: bd.id }),
    );
  const total = ns.filter((e) => e.end).reduce((s, e) => s + (e.end - e.start) / 6e4, 0);
  // 06:00-20:00 strip of the day
  const X = (mm) => Math.min(100, Math.max(0, ((mm - 360) / 840) * 100));
  let strip = '';
  if (tl) {
    strip = '<div class="strip"><div class="ax"></div>';
    ns.filter((e) => e.end).forEach((e) => {
      strip += `<div class="blk" style="left:${X(minuteOfDay(e.start)).toFixed(2)}%;width:${Math.max(0.8, X(minuteOfDay(e.end)) - X(minuteOfDay(e.start))).toFixed(2)}%"></div>`;
    });
    if (bd)
      strip += `<div class="bed" style="left:${X(minuteOfDay(bd.start)).toFixed(2)}%"><svg width="26" height="26" viewBox="0 0 20 20"><path d="M13.5 3a8 8 0 1 0 3.5 14 6.5 6.5 0 0 1-3.5-14z" fill="#9C96F2" stroke="#1F2358" stroke-width="1.2"/></svg></div>`;
    [6, 9, 12, 15, 18].forEach(
      (h) => (strip += `<span class="tick" style="left:${X(h * 60).toFixed(2)}%">${h}</span>`),
    );
    strip += '</div>';
  }
  let h = `<h2>${new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>`;
  if (tl)
    h += `<div class="sum">${ns.length ? ns.length + ' nap' + (ns.length > 1 ? 's' : '') + ', ' + duration(total) + ' in total' : 'No naps logged'}</div>${strip}<div class="tl">${tl}</div>`;
  else h += '<div class="sum">Nothing logged for this day</div>';
  h +=
    `<div class="addrow"><button class="lnk"${tapAction('add', { type: 'nap', day: d })}>＋ Add nap</button>` +
    (bd ? '' : `<button class="lnk"${tapAction('add', { type: 'night', day: d })}>＋ Log bedtime</button>`) +
    '</div>';
  if (historyNote && d < today - 14 * DAY) h += `<div class="mu" style="margin-top:8px">${historyNote}</div>`;
  $('#day').innerHTML = h;
}
