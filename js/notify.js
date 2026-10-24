// Notifications: the reminder plan written to the family document, push subscriptions and the bell box.

// ---------- notifications ----------
// The app only writes WHAT to notify about and WHEN (next nap / bedtime minus 30 min) into the family document.
// A GitHub Action (sender/notify.mjs) reads it every ~5 min and sends the push to every subscribed phone.
function syncNotify(want) {
  if (!db || !famData) return;
  const st = famData,
    now = Date.now();
  if (/^test-/.test(st.notifyKey || '') && st.notifySent !== st.notifyKey && now - (st.notifyAt || 0) < 30 * 60000)
    return; // a test is waiting for the sender
  const pending = !!st.notifyAt && (st.notifyEvent || 0) > now && st.notifySent !== st.notifyKey;
  const full = {
    notifyAt: want && want.at,
    notifyEvent: want && want.event,
    notifyKey: want && want.key,
    notifyLabel: want && want.label,
    notifyTime: want && want.time,
    notifyText: '',
  };
  let out = null;
  if (!want)
    out = pending ? { notifyAt: 0 } : null; // asleep, bedtime logged, or no data: cancel what is waiting
  else if (want.key !== st.notifyKey)
    out = want.at > now ? full : pending ? { notifyAt: 0 } : null; // a new event (or it is already < 30 min away)
  else if (
    st.notifySent !== st.notifyKey &&
    want.at > now &&
    (!st.notifyAt || Math.abs(want.at - st.notifyAt) >= 5 * 60000)
  )
    out = full; // same event, time moved
  if (!out) return;
  const j = JSON.stringify(out);
  if (j === lastNotifyWrite) return;
  lastNotifyWrite = j;
  fam()
    .set(out, { merge: true })
    .catch(() => {
      lastNotifyWrite = '';
    });
}

const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone =
  (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToU8 = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const subId = async (ep) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ep)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
const getSub = async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
};
async function saveSub(sub) {
  if (!db) return;
  const j = sub.toJSON();
  await fam()
    .collection('subs')
    .doc(await subId(j.endpoint))
    .set({
      sub: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      device: iOS ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'other',
      at: Date.now(),
    });
}
const pushOff = () => {
  try {
    return lsGet('pushoff') === '1';
  } catch {
    return false;
  }
};
const setPushOff = (v) => {
  try {
    v ? lsSet('pushoff', '1') : lsDel('pushoff');
  } catch {}
};
let pushDbg = '';
let refreshing = false;
async function refreshSub() {
  // keep the saved copy current; quietly re-subscribe if the phone dropped the subscription
  if (!(pushOk && db && Notification.permission === 'granted')) return;
  try {
    let s = await getSub();
    // the sender marks subscriptions the push service rejected (deadSubs): drop ours if it is one, then subscribe afresh
    if (s) {
      const id = await subId(s.endpoint),
        dead = famData && famData.deadSubs;
      if (dead && dead[id]) {
        try {
          await s.unsubscribe();
        } catch {}
        s = null;
        fam()
          .set({ deadSubs: { [id]: firebase.firestore.FieldValue.delete() } }, { merge: true })
          .catch(() => {});
        pushDbg = 'renewed a subscription the push service had dropped';
      }
    }
    if (!s && !pushOff()) {
      const reg = await navigator.serviceWorker.ready;
      s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
      pushDbg = 're-subscribed';
    }
    if (s) await saveSub(s);
  } catch (e) {
    pushDbg = 'error: ' + ((e && e.message) || e);
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
  if (!pushOk) return set('This browser does not support notifications.', true);
  if (iOS && !standalone)
    return set('On iPhone, open the app from its home-screen icon first, then come back here.', true);
  if (!db) return set('Needs sharing: add the family code in Settings (⚙ at the top) first.', true);
  if (Notification.permission === 'denied')
    return set('Blocked. Allow notifications for this app in the phone settings, then reopen it.', true);
  let sub = null;
  try {
    sub = await getSub();
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
        ? ' (' + (pushDbg || 'permission allowed, no subscription yet') + ')'
        : '');
}
async function togglePush() {
  const msg = $('#pushmsg');
  msg.textContent = '';
  try {
    const cur = await getSub();
    if (cur && Notification.permission === 'granted') {
      await fam()
        .collection('subs')
        .doc(await subId(cur.endpoint))
        .delete()
        .catch(() => {});
      await cur.unsubscribe();
      setPushOff(true);
      return renderPush();
    }
    if ((await Notification.requestPermission()) !== 'granted') return renderPush();
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) }));
    await saveSub(sub);
    setPushOff(false);
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
  fam().set(
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
