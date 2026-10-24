// Export data / Import data in Settings. The file format, the checks and what an import changes are in backup.js (pure,
// tested). The file is built here in the browser (Blob + download link), so no new address is needed. It never contains
// the family code.

const showBackupMessage = (t, ok) => {
  const m = $('#bkmsg');
  m.textContent = t;
  m.className = 'mu' + (ok ? ' ok' : '');
};
// every entry stored now: in shared mode the whole family log, straight from the server (the live sync only holds 14 days)
async function loadAllEntries() {
  if (!db) return entries.slice();
  const q = await familyRef().collection('entries').get({ source: 'server' });
  return q.docs.map((d) => d.data()).filter(isValidEntry);
}
$('#bkexp').addEventListener('click', async () => {
  showBackupMessage('Preparing the export…');
  let all;
  try {
    all = await loadAllEntries();
  } catch {
    return showBackupMessage("Couldn't load the whole shared log. Check the connection and try again.");
  }
  const now = Date.now(),
    x = Backup.makeExport(
      {
        entries: all,
        settings,
        extraNaps: db ? familyDoc && familyDoc.extraNaps : load('extra', null),
        prefs: { statsN: statsDays, pushOff: pushTurnedOff() },
      },
      now,
      VER,
    );
  const url = URL.createObjectURL(new Blob([Backup.toText(x)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = Backup.fileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  showBackupMessage(`Exported ${x.entries.length} entries to ${a.download}.`, true);
});
let pendingImport = null; // the checked file and the log it will be applied to, while the preview is open
$('#bkimp').addEventListener('click', () => {
  showBackupMessage('');
  $('#bkfile').value = '';
  $('#bkfile').click();
});
$('#bkfile').addEventListener('change', async () => {
  const f = $('#bkfile').files[0];
  if (!f) return;
  if (f.size > 5e6) return showBackupMessage('Nothing was imported: that file is too large to be a Nap Log export.');
  let text;
  try {
    text = await f.text();
  } catch {
    return showBackupMessage("Nothing was imported: couldn't read that file.");
  }
  const r = Backup.parseImport(text, Date.now());
  if (!r.ok) return showBackupMessage('Nothing was imported. ' + r.error);
  showBackupMessage('Checking against the log…');
  let have;
  try {
    have = await loadAllEntries();
  } catch {
    return showBackupMessage(
      "Nothing was imported: couldn't load the shared log to compare with. Check the connection and try again.",
    );
  }
  showBackupMessage('');
  pendingImport = { r, have };
  document.querySelector('input[name=imode][value=merge]').checked = true;
  const s = r.summary,
    day = (t) =>
      t == null ? '–' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  $('#iprev').innerHTML =
    `<p><b>${escapeHtml(s.count)} ${s.count === 1 ? 'entry' : 'entries'}</b> (${escapeHtml(s.naps)} ${s.naps === 1 ? 'nap' : 'naps'}, ${escapeHtml(s.nights)} ${s.nights === 1 ? 'night' : 'nights'})` +
    (s.count ? `, ${escapeHtml(day(s.first))} to ${escapeHtml(day(s.last))}` : '') +
    '.</p>' +
    `<p class="mu">${escapeHtml(f.name)}` +
    (s.exportedAt != null ? ` · exported ${escapeHtml(day(s.exportedAt))}` : '') +
    (s.app ? ` · Nap Log v${escapeHtml(s.app)}` : '') +
    ` · format ${escapeHtml(s.version)}</p>`;
  showImportPlan();
  $('#sdlg').close();
  $('#idlg').showModal();
});
function showImportPlan() {
  if (!pendingImport) return;
  const mode = document.querySelector('input[name=imode]:checked').value,
    d = pendingImport.r.data,
    p = (pendingImport.plan = Backup.planImport(pendingImport.have, d.entries, mode));
  const w = $('#iwhat'),
    shared = db ? ' Both phones will see the change.' : '';
  if (mode === 'merge') {
    w.className = 'mu';
    w.textContent = p.added
      ? `Adds ${p.added} new ${p.added === 1 ? 'entry' : 'entries'}.` +
        (p.kept ? ` ${p.kept} already here stay as they are.` : '') +
        ' Settings are not changed.' +
        shared
      : 'Everything in this file is already here. Nothing to add.';
    $('#igo').disabled = !p.added;
  } else {
    w.className = 'mu warn';
    w.textContent =
      `Deletes all ${pendingImport.have.length} entries now in the log and writes the ${p.put.length} from the file` +
      (d.settings ? `, and restores the settings (${d.settings.targetNaps} naps, bedtime ${d.settings.bedtime})` : '') +
      '.' +
      shared +
      ' Export first if you might want the current log back.';
    $('#igo').disabled = false;
  }
  $('#igo').textContent = mode === 'merge' ? 'Merge' : 'Replace…';
}
document.querySelectorAll('input[name=imode]').forEach((el) => el.addEventListener('change', showImportPlan));
$('#icancel').addEventListener('click', () => {
  pendingImport = null;
  $('#idlg').close();
});
$('#igo').addEventListener('click', async () => {
  if (!pendingImport) return;
  const p = pendingImport.plan,
    d = pendingImport.r.data;
  if (
    p.mode === 'replace' &&
    !confirm(
      `Really replace the whole log? ${pendingImport.have.length} entries will be deleted and replaced by the ${p.put.length} in the file` +
        (db ? ', on both phones' : '') +
        '. This cannot be undone.',
    )
  )
    return;
  const btn = $('#igo');
  btn.disabled = true;
  btn.textContent = 'Importing…';
  let msg;
  try {
    if (db) {
      // the normal sync path: written under the current family code, the live listeners then update both phones
      const col = familyRef().collection('entries'),
        ops = [...p.del.map((id) => (b) => b.delete(col.doc(id))), ...p.put.map((e) => (b) => b.set(col.doc(e.id), e))];
      for (let i = 0; i < ops.length; i += 400) {
        const b = db.batch();
        ops.slice(i, i + 400).forEach((op) => op(b));
        await b.commit();
      }
      if (p.mode === 'replace') {
        const up = {};
        if (d.settings) up.settings = d.settings;
        if (d.extraNaps) up.extraNaps = d.extraNaps;
        if (Object.keys(up).length) await familyRef().set(up, { merge: true });
      }
      olderEntries = {};
      last30Loaded = false; // older months are fetched again with the new data
    } else {
      entries = p.result;
      save('entries', entries);
      if (p.mode === 'replace' && d.extraNaps) save('extra', d.extraNaps);
    }
    if (p.mode === 'replace') {
      if (d.settings) {
        settings = cleanSettings(d.settings);
        save('settings', settings);
        fillSettingsForm();
      }
      if (d.prefs && d.prefs.statsN) setStatsDays(d.prefs.statsN);
    }
    msg = [
      p.mode === 'merge'
        ? `Imported: added ${p.added} ${p.added === 1 ? 'entry' : 'entries'}.`
        : `Replaced the log with ${p.put.length} entries from the file.`,
      true,
    ];
  } catch (e) {
    msg = [
      'The import stopped part-way (' +
        ((e && e.code) || 'error') +
        '). Check the connection and import the same file again with Merge.',
    ];
  }
  pendingImport = null;
  $('#idlg').close();
  render();
  openSettings();
  showBackupMessage(...msg);
});

$('#idlg').addEventListener('close', () => {
  pendingImport = null;
});
