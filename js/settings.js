// The Settings box: targets, family code (hidden until Show) and Save.

function initForm() {
  $('#sn').value = settings.targetNaps;
  $('#sb').value = settings.bedtime;
  $('#sf').value = family;
}

$('#ssave').addEventListener('click', () => {
  settings = okS({ targetNaps: $('#sn').value, bedtime: normT($('#sb').value) || settings.bedtime });
  save('settings', settings);
  const f = $('#sf').value.trim();
  if (f !== family) {
    family = f;
    save('family', f);
    connect();
  }
  if (db) fam().set({ settings }, { merge: true });
  $('#sdlg').close();
  render();
  renderPush();
});

// Settings: the cog (or the sync chip) opens it; the family code stays hidden until Show is tapped
const maskCode = (on) => {
  $('#sf').classList.toggle('masked', on);
  $('#sfshow').textContent = on ? 'Show' : 'Hide';
  $('#sfshow').setAttribute('aria-pressed', String(!on));
};
const openSettings = () => {
  initForm();
  maskCode(true);
  $('#updmsg').textContent = '';
  bkMsg('');
  $('#sdlg').showModal();
};

$('#cog').addEventListener('click', openSettings);
$('#sync').addEventListener('click', openSettings);
$('#sfshow').addEventListener('click', () => maskCode($('#sf').classList.contains('masked') ? false : true));
$('#scancel').addEventListener('click', () => $('#sdlg').close());
$('#sdlg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('#sdlg').close();
}); // tap outside to close
