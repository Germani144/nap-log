// Starting, stopping and re-planning: the actions behind the Start / End buttons and the extra-nap links.

// ---------- actions ----------
// every nap or night also saves what the app had predicted for it just before it started, with the app version
// (predBefore in plan.js). It works the same for the Start buttons and for entries filled in later by hand.
const withPred = (e, old) => {
  if (old && old.pred && old.start === e.start) return e; // keep the saved prediction while the start time is unchanged
  const p = predBefore(allE(), e, planSettings());
  const { pred, ...rest } = e;
  return p ? { ...rest, pred: { ...p, v: VER } } : rest;
};
function startE(type) {
  putEntry(withPred({ id: uid(), type, start: Date.now(), end: null }));
}
function stopE(id) {
  const e = entries.find((x) => x.id === id);
  if (e) putEntry({ ...e, end: Date.now() });
}
// Extra naps added to today's plan by hand ("＋ Add extra nap"): shared through the family document, reset every day.
const extraToday = () => {
  const x = db ? famData && famData.extraNaps : load('extra', null);
  return x && x.day === isoDay(Date.now()) ? Math.max(0, Math.min(3, Math.round(+x.n) || 0)) : 0;
};
const planSettings = () => ({ ...settings, extraNaps: extraToday() });

function setExtra(n) {
  markAnim();
  const v = { day: isoDay(Date.now()), n: Math.max(0, Math.min(3, n)) };
  if (db) {
    famData = { ...(famData || {}), extraNaps: v };
    fam().set({ extraNaps: v }, { merge: true });
  } else save('extra', v);
  render();
}
