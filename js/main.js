// Startup: tap actions, service worker, Check for updates, first render. Loaded last.

// Every tappable thing drawn as HTML (plan rows, the ring, calendar days, buttons) carries data-act="…" (made by
// tapAction() in core.js); this one listener runs the matching action. Numbers arrive as text in data-*, so they are converted here.
const ACTIONS = {
  edit: (d) => openEdit(d.id),
  add: (d) => openAdd(d.type, d.day ? +d.day : undefined),
  'log-wake': () => logWake(),
  'extra-more': () => setExtraNaps(extraNapsToday() + 1),
  'extra-less': () => setExtraNaps(extraNapsToday() - 1),
  start: (d) => startSleep(d.type),
  stop: (d) => endSleep(d.id),
  tab: (d) => setTab(d.tab),
  'stats-range': (d) => setStatsDays(+d.n),
  'pick-day': (d) => pickDay(+d.day),
  month: (d) => showMonth(+d.y, +d.m),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el.dataset);
});

fillSettingsForm();

// The app opens from the service worker's cache (see sw.js). When a new version's worker takes over, reload once so
// the screen runs the new files; not on the very first install, when there was no worker before.
if ('serviceWorker' in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js', { scope: './', updateViaCache: 'none' })
    .then((reg) => {
      // an installed app is often resumed rather than reopened, so also look for a new version when it comes back
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
$('#ver').textContent = 'v' + VER;
// Check for updates: read the version the server is serving from sw.js (its cache name, kept equal to VER), bypassing
// every cache. If it differs, delete only Nap Log's own caches (the address may be shared), update the worker (it saves a
// fresh offline copy) and reload.
$('#updbtn').addEventListener('click', async () => {
  const btn = $('#updbtn'),
    msg = $('#updmsg'),
    cur = VER;
  btn.textContent = 'Checking…';
  btn.disabled = true;
  msg.textContent = '';
  let latest = null;
  try {
    const r = await fetch('sw.js?check=' + Date.now(), { cache: 'no-store' });
    if (r.ok) latest = versionInSw(await r.text());
  } catch {}
  btn.textContent = 'Check for updates';
  btn.disabled = false;
  if (!latest) {
    msg.textContent = "Couldn't reach the server. Check the connection and try again.";
    return;
  }
  if (latest === cur) {
    msg.textContent = `You're on the latest version (v${cur}).`;
    return;
  }
  if (!confirm(`Version v${latest} is available (you have v${cur}). Update now?`)) return;
  btn.textContent = 'Updating…';
  btn.disabled = true;
  try {
    for (const k of await caches.keys()) if (k.startsWith('nap-log-') || /^nap-v\d/.test(k)) await caches.delete(k);
  } catch {}
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
  } catch {}
  location.reload();
});
connectSync();
render();
renderPush();
setInterval(render, 30000);
