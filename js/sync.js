// Saving entries: Firestore under the family code (shared mode) or this phone only (local mode).

const familyRef = () => db.collection('families').doc(familyCode);
const showSyncStatus = (t, local) => {
  const e = $('#sync');
  e.className = 'chip' + (local ? ' local' : '');
  e.innerHTML = '<i></i>' + t;
};
function saveEntry(e) {
  if (db) {
    familyRef().collection('entries').doc(e.id).set(e);
    // outside the live 14-day window the listener will not bring it back, so keep a local copy
    if (e.start < startOfDay(Date.now()) - 14 * DAY) {
      olderEntries[e.id] = e;
      renderHistory();
    }
  } else {
    entries = entries.filter((x) => x.id !== e.id).concat(e);
    save('entries', entries);
    render();
  }
}
function deleteEntry(id) {
  if (db) {
    familyRef().collection('entries').doc(id).delete();
    delete olderEntries[id];
    renderHistory();
  } else {
    entries = entries.filter((x) => x.id !== id);
    save('entries', entries);
    render();
  }
}
function connectSync() {
  unsubscribers.forEach((f) => f());
  unsubscribers = [];
  db = null;
  familyDoc = null;
  if (typeof firebase === 'undefined' || !FIREBASE_CONFIG || !familyCode) {
    showSyncStatus('local only', true);
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
  unsubscribers.push(
    familyRef().onSnapshot((d) => {
      familyDoc = d.data() || {};
      if (familyDoc.deadSubs && Object.keys(familyDoc.deadSubs).length && !refreshingSubscription) {
        refreshingSubscription = true;
        refreshSubscription().finally(() => {
          refreshingSubscription = false;
        });
      }
      lastReminderWrite = '';
      const s = familyDoc.settings;
      if (s) {
        settings = cleanSettings(s);
        save('settings', settings);
        fillSettingsForm();
      }
      render();
    }),
  );
  // only sync the last 14 days: all the plan and the 7-day averages need, and it keeps Firestore reads tiny
  unsubscribers.push(
    familyRef()
      .collection('entries')
      .where('start', '>=', startOfDay(Date.now()) - 14 * DAY)
      .onSnapshot((q) => {
        entries = q.docs.map((d) => d.data()).filter(isValidEntry);
        save('entries', entries);
        render();
      }),
  );
  showSyncStatus('shared');
  refreshSubscription();
  renderPush();
}
