// Shared app state and small helpers used by every screen.

const $ = (s) => document.querySelector(s);

// Everything synced from the shared log is checked before use: the page builds HTML from it, so a malformed
// (or malicious) value must never reach the screen as markup or script. Bad entries are dropped, bad settings reset.
// okE (entries) and okS (settings) live in backup.js, which is tested and also checks imported files.
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
// Tap actions in generated HTML: act('edit', { id }) gives ' data-act="edit" data-id="…"'. One listener in main.js runs
// them (the Content-Security-Policy forbids inline onclick code). Values are escaped like everything else.
const act = (name, data = {}) =>
  ` data-act="${name}"` +
  Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
let settings = okS(load('settings', {})),
  entries = [].concat(load('entries', [])).filter(okE),
  family = load('family', ''),
  db = null,
  unsubs = [],
  famData = null,
  lastNotifyWrite = '';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// history tab state; `hist` holds entries older than the live 14-day sync window (shared mode only)
let hist = {},
  tab = 'today',
  viewM = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selDay = sod(Date.now());
const allE = () => {
  const m = {};
  Object.values(hist).forEach((e) => (m[e.id] = e));
  entries.forEach((e) => (m[e.id] = e));
  return Object.values(m);
};
const findE = (id) => entries.find((x) => x.id === id) || hist[id];
