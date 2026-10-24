// Notifications: the reminder plan written to the family document, push subscriptions and the bell box.

// ---------- notifications ----------
// The app only writes WHAT to notify about and WHEN (next nap / bedtime minus 30 min) into the family document.
// A GitHub Action (sender/notify.mjs) reads it every ~5 min and sends the push to every subscribed phone.
function syncReminder(want) {
  if (!db || !familyDoc) return;
  const out = reminderUpdate(want, familyDoc, Date.now());
  if (!out) return;
  const j = JSON.stringify(out);
  if (j === lastReminderWrite) return;
  lastReminderWrite = j;
  familyRef()
    .set(out, { merge: true })
    .catch(() => {
      lastReminderWrite = '';
    });
}

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone =
  (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const subscriptionId = async (ep) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ep)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
const getSubscription = async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
};
async function saveSubscription(sub) {
  if (!db) return;
  const j = sub.toJSON();
  await familyRef()
    .collection('subs')
    .doc(await subscriptionId(j.endpoint))
    .set({
      sub: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      device: deviceName(navigator.userAgent),
      at: Date.now(),
    });
}
const pushTurnedOff = () => {
  try {
    return lsGet('pushoff') === '1';
  } catch {
    return false;
  }
};
const setPushTurnedOff = (v) => {
  try {
    v ? lsSet('pushoff', '1') : lsDel('pushoff');
  } catch {}
};
let pushNote = '';
let refreshingSubscription = false;
async function refreshSubscription() {
  // keep the saved copy current; quietly re-subscribe if the phone dropped the subscription
  if (!(pushSupported && db && Notification.permission === 'granted')) return;
  try {
    let s = await getSubscription();
    // the sender marks subscriptions the push service rejected (deadSubs): drop ours if it is one, then subscribe afresh
    if (s) {
      const id = await subscriptionId(s.endpoint),
        dead = familyDoc && familyDoc.deadSubs;
      if (dead && dead[id]) {
        try {
          await s.unsubscribe();
        } catch {}
        s = null;
        familyRef()
          .set({ deadSubs: { [id]: firebase.firestore.FieldValue.delete() } }, { merge: true })
          .catch(() => {});
        pushNote = 'renewed a subscription the push service had dropped';
      }
    }
    if (!s && !pushTurnedOff()) {
      const reg = await navigator.serviceWorker.ready;
      s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC),
      });
      pushNote = 're-subscribed';
    }
    if (s) await saveSubscription(s);
  } catch (e) {
    pushNote = 'error: ' + ((e && e.message) || e);
  }
  renderPush();
}
async function renderPush() {
  const st = $('#pushstat'),
    btn = $('#pushbtn'),
    tst = $('#pushtest');
  btn.disabled = false;
  tst.hidden = true;
  btn.textContent = '🔔 Enable push notifications';
  btn.className = 'wide';
  $('#bell').classList.remove('on'); // lit again below only when this phone really has notifications on
  const set = (t, off) => {
    st.textContent = t;
    if (off) btn.disabled = true;
  };
  if (!pushSupported) return set('This browser does not support notifications.', true);
  if (isIos && !isStandalone)
    return set('On iPhone, open the app from its home-screen icon first, then come back here.', true);
  if (!db) return set('Needs sharing: add the family code in Settings (⚙ at the top) first.', true);
  if (Notification.permission === 'denied')
    return set('Blocked. Allow notifications for this app in the phone settings, then reopen it.', true);
  let sub = null;
  try {
    sub = await getSubscription();
  } catch {}
  $('#bell').classList.toggle('on', !!(sub && Notification.permission === 'granted'));
  if (sub && Notification.permission === 'granted') {
    st.textContent =
      '🔔 Notifications are on for this phone: a heads-up about 30 minutes before the next nap or bedtime.';
    btn.textContent = 'Turn off';
    btn.className = 'x';
    tst.hidden = false;
  } else
    st.textContent =
      'Get a heads-up about 30 minutes before the next nap or bedtime.' +
      (Notification.permission === 'granted'
        ? ' (' + (pushNote || 'permission allowed, no subscription yet') + ')'
        : '');
}
async function togglePush() {
  const msg = $('#pushmsg');
  msg.textContent = '';
  try {
    const cur = await getSubscription();
    if (cur && Notification.permission === 'granted') {
      await familyRef()
        .collection('subs')
        .doc(await subscriptionId(cur.endpoint))
        .delete()
        .catch(() => {});
      await cur.unsubscribe();
      setPushTurnedOff(true);
      return renderPush();
    }
    if ((await Notification.requestPermission()) !== 'granted') return renderPush();
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC),
      }));
    await saveSubscription(sub);
    setPushTurnedOff(false);
  } catch (e) {
    msg.textContent = 'Could not turn notifications on: ' + ((e && e.message) || e);
  }
  renderPush();
}
$('#pushbtn').addEventListener('click', togglePush);
// the bell at the top opens the notifications box (it used to be a fold under the plan)
$('#bell').addEventListener('click', () => {
  $('#pushmsg').textContent = '';
  renderPush();
  $('#ndlg').showModal();
});
$('#nclose').addEventListener('click', () => $('#ndlg').close());
$('#ndlg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('#ndlg').close();
}); // tap outside to close
$('#pushtest').addEventListener('click', () => {
  if (!db) return;
  familyRef().set(
    {
      notifyAt: Date.now(),
      notifyEvent: 0,
      notifyKey: 'test-' + Date.now(),
      notifyLabel: '',
      notifyTime: '',
      notifyText: 'Notifications work 🎉',
    },
    { merge: true },
  );
  $('#pushmsg').textContent = 'Test queued. It arrives within about 5-10 minutes, sometimes later.';
});
