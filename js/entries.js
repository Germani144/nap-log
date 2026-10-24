// Starting, stopping and re-planning: the actions behind the Start / End buttons and the extra-nap links.

// every nap or night also saves what the app had predicted for it just before it started, with the app version
// (predBefore in plan.js). It works the same for the Start buttons and for entries filled in later by hand.
const withPrediction = (e, old) => {
  if (old && old.pred && old.start === e.start) return e; // keep the saved prediction while the start time is unchanged
  const p = predBefore(allEntries(), e, planSettings());
  const { pred, ...rest } = e;
  return p ? { ...rest, pred: { ...p, v: VER } } : rest;
};
function startSleep(type) {
  saveEntry(withPrediction({ id: newId(), type, start: Date.now(), end: null }));
}
function endSleep(id) {
  const e = entries.find((x) => x.id === id);
  if (e) saveEntry({ ...e, end: Date.now() });
}
// Extra naps added to today's plan by hand ("＋ Add extra nap"): shared through the family document, reset every day.
const extraNapsToday = () =>
  extraNapsFrom(db ? familyDoc && familyDoc.extraNaps : load('extra', null), isoDay(Date.now()));
const planSettings = () => ({ ...settings, extraNaps: extraNapsToday() });

function setExtraNaps(n) {
  animateNextRender();
  const v = { day: isoDay(Date.now()), n: Math.max(0, Math.min(3, n)) };
  if (db) {
    familyDoc = { ...(familyDoc || {}), extraNaps: v };
    familyRef().set({ extraNaps: v }, { merge: true });
  } else save('extra', v);
  render();
}
