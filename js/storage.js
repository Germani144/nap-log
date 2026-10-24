// localStorage helpers. Loaded first: the old-key move below runs before anything reads settings.

// localStorage is shared by every app on this origin, so keys are stored as "nap-log.<name>".
// Older builds used "nt_<name>"; they are moved over once, here, before anything reads them.
const LS = 'nap-log.';
const lsGet = (k) => localStorage.getItem(LS + k);
const lsSet = (k, v) => localStorage.setItem(LS + k, v);
const lsDel = (k) => localStorage.removeItem(LS + k);
try {
  for (const k of ['settings', 'entries', 'family', 'extra', 'pushoff', 'statsN']) {
    const o = localStorage.getItem('nt_' + k);
    if (o !== null) {
      if (lsGet(k) === null) lsSet(k, o);
      localStorage.removeItem('nt_' + k);
    }
  }
} catch {}
const load = (k, d) => {
  try {
    const v = JSON.parse(lsGet(k));
    return v ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    lsSet(k, JSON.stringify(v));
  } catch {}
};
