// Saving entries: Firestore under the family code (shared mode) or this phone only (local mode).

// ---------- storage / sync ----------
const fam = () => db.collection('families').doc(family);
const setSync = (t, local) => {
  const e = $('#sync');
  e.className = 'chip' + (local ? ' local' : '');
  e.innerHTML = '<i></i>' + t;
};
function putEntry(e) {
  if (db) {
    fam().collection('entries').doc(e.id).set(e);
    if (e.start < sod(Date.now()) - 14 * DAY) {
      hist[e.id] = e;
      renderHistory();
    } // outside the live window: keep a local copy
  } else {
    entries = entries.filter((x) => x.id !== e.id).concat(e);
    save('entries', entries);
    render();
  }
}
function removeEntry(id) {
  if (db) {
    fam().collection('entries').doc(id).delete();
    delete hist[id];
    renderHistory();
  } else {
    entries = entries.filter((x) => x.id !== id);
    save('entries', entries);
    render();
  }
}
function connect() {
  unsubs.forEach((f) => f());
  unsubs = [];
  db = null;
  famData = null;
  if (typeof firebase === 'undefined' || !FIREBASE_CONFIG || !family) {
    setSync('local only', true);
    return render();
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
    try {
      firebase
        .firestore()
        .enablePersistence({ synchronizeTabs: true })
        .catch(() => {});
    } catch {}
  }
  db = firebase.firestore();
  unsubs.push(
    fam().onSnapshot((d) => {
      famData = d.data() || {};
      if (famData.deadSubs && Object.keys(famData.deadSubs).length && !refreshing) {
        refreshing = true;
        refreshSub().finally(() => {
          refreshing = false;
        });
      }
      lastNotifyWrite = '';
      const s = famData.settings;
      if (s) {
        settings = okS(s);
        save('settings', settings);
        initForm();
      }
      render();
    }),
  );
  // only sync the last 14 days: all the plan and the 7-day averages need, and it keeps Firestore reads tiny
  unsubs.push(
    fam()
      .collection('entries')
      .where('start', '>=', sod(Date.now()) - 14 * DAY)
      .onSnapshot((q) => {
        entries = q.docs.map((d) => d.data()).filter(okE);
        save('entries', entries);
        render();
      }),
  );
  setSync('shared');
  refreshSub();
  renderPush();
}
