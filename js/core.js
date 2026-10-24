// Nap Log core: small pure functions (no screen, storage, network or clock; "now" is passed in), shared by the app
// files and tested directly in Node (tests/core.test.mjs). Loaded after plan.js and backup.js, before the app files.

// ---------- HTML ----------
// Everything put into HTML that came from the shared log, a file or typing is escaped first.
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');

// Tap actions in generated HTML: tapAction('edit', { id }) gives ' data-act="edit" data-id="…"'. One listener in main.js runs
// them (the Content-Security-Policy forbids inline onclick code). Values are escaped like everything else.
const tapAction = (name, data = {}) =>
  ` data-act="${name}"` +
  Object.entries(data)
    .map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`)
    .join('');

// ---------- typed times ----------
// A typed "HH:MM" on a given day (local midnight) as a timestamp.
const timeOnDay = (day, v) => {
  const [h, m] = v.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return +d;
};

// time fields are typed (numeric keypad), not picked on the clock dial: "1437" -> 14:37, "730" -> 07:30, "9" -> 09:00
function parseTypedTime(v) {
  v = String(v || '').trim();
  if (!v) return '';
  let h, m;
  if (v.includes(':')) {
    [h, m] = v.split(':').map((x) => x.replace(/\D/g, ''));
    m = m || '0';
  } else {
    const d = v.replace(/\D/g, '');
    if (!d) return null;
    if (d.length <= 2) {
      h = d;
      m = '0';
    } else if (d.length === 3) {
      h = d[0];
      m = d.slice(1);
    } else {
      h = d.slice(0, 2);
      m = d.slice(2, 4);
    }
  }
  h = +h;
  m = +m;
  if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ---------- extra naps ----------
// How many extra naps were added to today's plan by hand: stored = {day: 'YYYY-MM-DD', n} (family document or this
// phone), todayIso = today's date. Only today's value counts, kept between 0 and 3.
function extraNapsFrom(stored, todayIso) {
  return stored && stored.day === todayIso ? Math.max(0, Math.min(3, Math.round(+stored.n) || 0)) : 0;
}

// ---------- reminders ----------
// What to write into the family document so the push sender (sender/notify.mjs) sends the right reminder, or null for
// nothing. want = the plan's next reminder ({key, at, event, label, time}, from makePlan) or null; doc = the family
// document now; now = ms.
function reminderUpdate(want, doc, now) {
  const st = doc;
  if (/^test-/.test(st.notifyKey || '') && st.notifySent !== st.notifyKey && now - (st.notifyAt || 0) < 30 * 60000)
    return null; // a test is waiting for the sender
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
  return out;
}

// ---------- push ----------
// The VAPID public key (base64url) as bytes, for pushManager.subscribe.
const base64UrlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
// Which kind of phone a push subscription belongs to (saved with it, for debugging).
const deviceName = (userAgent) =>
  /iPhone|iPad|iPod/.test(userAgent) ? 'iPhone' : /Android/.test(userAgent) ? 'Android' : 'other';

// ---------- updates ----------
// The version the server's sw.js carries in its cache name (kept equal to VER), or null. Older versions read it with the
// same regex, so the cache-name line in sw.js keeps exactly this shape.
const versionInSw = (swText) => (/C=P\+'v([\d.]+)'/.exec(swText) || [])[1] || null;

if (typeof module !== 'undefined')
  module.exports = {
    escapeHtml,
    tapAction,
    timeOnDay,
    parseTypedTime,
    extraNapsFrom,
    reminderUpdate,
    base64UrlToBytes,
    deviceName,
    versionInSw,
  };
