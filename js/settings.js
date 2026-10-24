// The Settings box: targets, family code (hidden until Show) and Save.

function fillSettingsForm() {
  $('#sn').value = settings.targetNaps;
  $('#sb').value = settings.bedtime;
  $('#sf').value = familyCode;
}

$('#ssave').addEventListener('click', () => {
  settings = cleanSettings({ targetNaps: $('#sn').value, bedtime: parseTypedTime($('#sb').value) || settings.bedtime });
  save('settings', settings);
  const f = $('#sf').value.trim();
  if (f !== familyCode) {
    familyCode = f;
    save('family', f);
    connectSync();
  }
  if (db) familyRef().set({ settings }, { merge: true });
  $('#sdlg').close();
  render();
  renderPush();
});

// Settings: the cog (or the sync chip) opens it; the family code stays hidden until Show is tapped
const setCodeHidden = (on) => {
  $('#sf').classList.toggle('masked', on);
  $('#sfshow').textContent = on ? 'Show' : 'Hide';
  $('#sfshow').setAttribute('aria-pressed', String(!on));
};
const openSettings = () => {
  fillSettingsForm();
  setCodeHidden(true);
  $('#updmsg').textContent = '';
  showBackupMessage('');
  $('#sdlg').showModal();
};

$('#cog').addEventListener('click', openSettings);
$('#sync').addEventListener('click', openSettings);
$('#sfshow').addEventListener('click', () => setCodeHidden(!$('#sf').classList.contains('masked')));
$('#scancel').addEventListener('click', () => $('#sdlg').close());
// tapping outside the box (on the backdrop) closes it
$('#sdlg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('#sdlg').close();
});
