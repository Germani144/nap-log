// Shared app state and small helpers used by every screen.

const $ = (s) => document.querySelector(s);

// Everything synced from the shared log is checked before use: the page builds HTML from it, so a malformed
// (or malicious) value must never reach the screen as markup or script. Bad entries are dropped, bad settings reset.
// isValidEntry (entries) and cleanSettings (settings) live in backup.js, which is tested and also checks imported files.
let settings = cleanSettings(load('settings', {})),
  entries = [].concat(load('entries', [])).filter(isValidEntry),
  familyCode = load('family', ''),
  db = null,
  unsubscribers = [],
  familyDoc = null,
  lastReminderWrite = '';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// history tab state; `hist` holds entries older than the live 14-day sync window (shared mode only)
let olderEntries = {},
  currentTab = 'today',
  shownMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDay = startOfDay(Date.now());
const allEntries = () => {
  const m = {};
  Object.values(olderEntries).forEach((e) => (m[e.id] = e));
  entries.forEach((e) => (m[e.id] = e));
  return Object.values(m);
};
const findEntry = (id) => entries.find((x) => x.id === id) || olderEntries[id];
