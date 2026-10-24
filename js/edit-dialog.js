// The edit box for a nap or night: opening it for an entry or a new one, typed times, Save and Delete.

let ed = null;
// open the edit box without focusing a time field, so the keyboard only appears when a time is tapped
// a night's fields are its bedtime and wake-up; a nap's are its start and end
const dlgLabels = (type) => {
  $('#esl').textContent = type === 'night' ? 'Bedtime' : 'Start';
  $('#eel').textContent = type === 'night' ? 'Wake-up' : 'End';
};
function openDlg() {
  dlgLabels(ed && ed.type);
  $('#dlg').showModal();
  const f = document.activeElement;
  if (f && f.matches('input')) f.blur();
}
function openEdit(id) {
  const e = findE(id);
  if (!e) return;
  ed = { id, type: e.type, day: sod(e.start), wasOpen: !e.end };
  $('#dt').textContent = (e.type === 'nap' ? 'Nap' : 'Night sleep') + ' · ' + isoDay(e.start).slice(5);
  $('#es').value = hm(tod(e.start));
  $('#ee').value = e.end ? hm(tod(e.end)) : '';
  $('#edel').style.display = '';
  openDlg();
}
function openAdd(type, day, title) {
  const t0 = !day || day === sod(Date.now());
  day = day || sod(Date.now());
  ed = { id: null, type, day, wasOpen: t0 }; // only today's entry may stay open-ended (in progress)
  $('#dt').textContent =
    title ||
    (type === 'nap' ? (t0 ? 'Add extra nap' : 'Add nap') : 'Log bedtime') + (t0 ? '' : ' · ' + isoDay(day).slice(5));
  $('#es').value = type === 'night' ? settings.bedtime : '';
  $('#ee').value = '';
  $('#edel').style.display = 'none';
  openDlg();
}
// Today's wake-up when it was not logged (the plan shows the 7-day average, "~05:37"): tapping it edits last night's
// entry if there is one (it may have ended at a wrong time), otherwise logs last night with its bedtime and wake-up.
function logWake() {
  const y = sod(sod(Date.now()) - 12 * 36e5),
    n = allE()
      .filter((e) => e.type === 'night' && sod(e.start) === y)
      .sort((a, b) => b.start - a.start)[0];
  if (n) return openEdit(n.id);
  openAdd('night', y, 'Last night · bedtime and wake-up');
}

const atTime = (day, v) => {
  const [h, m] = v.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return +d;
};
// time fields are typed (numeric keypad), not picked on the clock dial: "1437" -> 14:37, "730" -> 07:30, "9" -> 09:00
function normT(v) {
  v = String(v || '').trim();
  if (!v) return '';
  let h, m;
  if (v.includes(':')) {
    [h, m] = v.split(':').map((x) => x.replace(/\D/g, ''));
    m = m || '0';
  } else {
    const d = v.replace(/\D/g, '');
    if (!d) return null;
    if (d.length <= 2) {
      h = d;
      m = '0';
    } else if (d.length === 3) {
      h = d[0];
      m = d.slice(1);
    } else {
      h = d.slice(0, 2);
      m = d.slice(2, 4);
    }
  }
  h = +h;
  m = +m;
  if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
document.querySelectorAll('input.tm').forEach((el) => {
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '');
    if (d.length >= 4 && !el.value.includes(':')) el.value = d.slice(0, 2) + ':' + d.slice(2, 4);
  });
  el.addEventListener('blur', () => {
    const n = normT(el.value);
    if (n) el.value = n;
  });
  el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
});
$('#esave').addEventListener('click', () => {
  const sv = normT($('#es').value),
    ev = normT($('#ee').value);
  if (sv === null || ev === null) return alert('Type the time as hours and minutes, for example 14:30');
  if (!sv) return alert('Set a start time');
  const st = atTime(ed.day, sv);
  let en = null;
  if (ev) {
    en = atTime(ed.day, ev);
    if (en <= st) en += DAY;
  } // e.g. night sleep crossing midnight
  else if (!ed.wasOpen) return alert('Set an end time, or delete the entry');
  if (st > Date.now() + 6e4 || (en && en > Date.now() + 6e4))
    return alert('That time is still in the future. Log it once it has happened.');
  const old = ed.id && findE(ed.id);
  markAnim();
  putEntry(withPred({ ...(old || {}), id: ed.id || uid(), type: ed.type, start: st, end: en }, old));
  $('#dlg').close();
});
$('#ecancel').addEventListener('click', () => $('#dlg').close());
$('#edel').addEventListener('click', () => {
  if (confirm('Delete this entry?')) {
    markAnim();
    removeEntry(ed.id);
    $('#dlg').close();
  }
});
