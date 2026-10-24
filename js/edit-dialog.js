// The edit box for a nap or night: opening it for an entry or a new one, typed times, Save and Delete.

let editing = null;
// open the edit box without focusing a time field, so the keyboard only appears when a time is tapped
// a night's fields are its bedtime and wake-up; a nap's are its start and end
const setEditLabels = (type) => {
  $('#esl').textContent = type === 'night' ? 'Bedtime' : 'Start';
  $('#eel').textContent = type === 'night' ? 'Wake-up' : 'End';
};
function showEditDialog() {
  setEditLabels(editing && editing.type);
  $('#dlg').showModal();
  const f = document.activeElement;
  if (f && f.matches('input')) f.blur();
}
function openEdit(id) {
  const e = findEntry(id);
  if (!e) return;
  editing = { id, type: e.type, day: startOfDay(e.start), wasOpen: !e.end };
  $('#dt').textContent = (e.type === 'nap' ? 'Nap' : 'Night sleep') + ' · ' + isoDay(e.start).slice(5);
  $('#es').value = clockTime(minuteOfDay(e.start));
  $('#ee').value = e.end ? clockTime(minuteOfDay(e.end)) : '';
  $('#edel').style.display = '';
  showEditDialog();
}
function openAdd(type, day, title) {
  const t0 = !day || day === startOfDay(Date.now());
  day = day || startOfDay(Date.now());
  editing = { id: null, type, day, wasOpen: t0 }; // only today's entry may stay open-ended (in progress)
  $('#dt').textContent =
    title ||
    (type === 'nap' ? (t0 ? 'Add extra nap' : 'Add nap') : 'Log bedtime') + (t0 ? '' : ' · ' + isoDay(day).slice(5));
  $('#es').value = type === 'night' ? settings.bedtime : '';
  $('#ee').value = '';
  $('#edel').style.display = 'none';
  showEditDialog();
}
// Today's wake-up when it was not logged (the plan shows the 7-day average, "~05:37"): tapping it edits last night's
// entry if there is one (it may have ended at a wrong time), otherwise logs last night with its bedtime and wake-up.
function logWake() {
  const y = startOfDay(startOfDay(Date.now()) - 12 * 36e5),
    n = allEntries()
      .filter((e) => e.type === 'night' && startOfDay(e.start) === y)
      .sort((a, b) => b.start - a.start)[0];
  if (n) return openEdit(n.id);
  openAdd('night', y, 'Last night · bedtime and wake-up');
}

document.querySelectorAll('input.tm').forEach((el) => {
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '');
    if (d.length >= 4 && !el.value.includes(':')) el.value = d.slice(0, 2) + ':' + d.slice(2, 4);
  });
  el.addEventListener('blur', () => {
    const n = parseTypedTime(el.value);
    if (n) el.value = n;
  });
  el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
});
$('#esave').addEventListener('click', () => {
  const sv = parseTypedTime($('#es').value),
    ev = parseTypedTime($('#ee').value);
  if (sv === null || ev === null) return alert('Type the time as hours and minutes, for example 14:30');
  if (!sv) return alert('Set a start time');
  const st = timeOnDay(editing.day, sv);
  let en = null;
  if (ev) {
    en = timeOnDay(editing.day, ev);
    if (en <= st) en += DAY;
  } // e.g. night sleep crossing midnight
  else if (!editing.wasOpen) return alert('Set an end time, or delete the entry');
  if (st > Date.now() + 6e4 || (en && en > Date.now() + 6e4))
    return alert('That time is still in the future. Log it once it has happened.');
  const old = editing.id && findEntry(editing.id);
  animateNextRender();
  saveEntry(withPrediction({ ...(old || {}), id: editing.id || newId(), type: editing.type, start: st, end: en }, old));
  $('#dlg').close();
});
$('#ecancel').addEventListener('click', () => $('#dlg').close());
$('#edel').addEventListener('click', () => {
  if (confirm('Delete this entry?')) {
    animateNextRender();
    deleteEntry(editing.id);
    $('#dlg').close();
  }
});
