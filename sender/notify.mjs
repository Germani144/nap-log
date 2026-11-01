// Sends the "nap / bedtime in about 30 min" push notifications.
// Run by GitHub Actions every ~5 minutes (see .github/workflows/notify.yml).
//
// The app writes the next planned notification into the family document in Firestore.
// This script reads it and, if it is due, sends it to every phone that enabled notifications.
// The log is public (this repo is public), so it only prints counts, never codes or times.
import webpush from 'web-push';
import { readAppConfig, pagesAddress } from './config.mjs';

// Each message also becomes a run annotation (visible without opening the log). Counts and statuses only, never codes or times.
const log = (m) => console.log('::notice::' + m);
const GRACE = 3 * 60e3; // do not send in the last 3 minutes before the event itself: too late to be useful

const code = process.env.FAMILY_CODE;
const priv = process.env.VAPID_PRIVATE_KEY;
const now = +process.env.TEST_NOW || Date.now();

// Not set up (a copy of the app that skipped reminders): stop quietly, without failing the run.
if (!code || !priv) {
  log(
    'Reminders are not set up: add FAMILY_CODE and VAPID_PRIVATE_KEY under Settings > Secrets and variables > Actions.',
  );
  process.exit(0);
}
const cfg = readAppConfig(new URL('../js/config.js', import.meta.url));
if (!cfg.FIREBASE_CONFIG || !cfg.VAPID_PUBLIC || !cfg.APP_ADDRESS) {
  log('js/config.js has no Firebase project, push key or address yet: nothing to send.');
  process.exit(0);
}
const here = pagesAddress(process.env.GITHUB_REPOSITORY);
if (here && here !== cfg.APP_ADDRESS) {
  log('js/config.js belongs to another address (' + cfg.APP_ADDRESS + '); fill it in for ' + here + ' first.');
  process.exit(0);
}
const PROJECT_ID = cfg.FIREBASE_CONFIG.projectId;
const API_KEY = cfg.FIREBASE_CONFIG.apiKey; // public web key, the same as in the app
const VAPID_PUBLIC_KEY = cfg.VAPID_PUBLIC;
const SITE = cfg.APP_ADDRESS;
const FS =
  process.env.FS_BASE || `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
webpush.setVapidDetails(SITE, VAPID_PUBLIC_KEY, priv);

const val = (v) =>
  v == null
    ? null
    : 'stringValue' in v
      ? v.stringValue
      : 'integerValue' in v
        ? Number(v.integerValue)
        : 'doubleValue' in v
          ? v.doubleValue
          : null;
const url = (path, extra = '') => `${FS}/${path}?${extra}key=${API_KEY}`;
// The web key may be restricted to the app's address in Google Cloud, so every request names the app as its Referer.
const fetch = (u, o = {}) => globalThis.fetch(u, { ...o, headers: { ...(o.headers || {}), Referer: SITE } });
const famPath = `families/${encodeURIComponent(code)}`;

async function main() {
  const r = await fetch(url(famPath));
  if (r.status === 404) return log('No family document yet.');
  if (!r.ok) return log('Could not read Firestore (HTTP ' + r.status + '), will retry next run.');
  const f = (await r.json()).fields || {};
  const n = {
    at: val(f.notifyAt) || 0,
    event: val(f.notifyEvent) || 0,
    key: val(f.notifyKey) || '',
    label: val(f.notifyLabel) || '',
    time: val(f.notifyTime) || '',
    text: val(f.notifyText) || '',
    sent: val(f.notifySent) || '',
  };

  if (!n.at || !n.key) return log('Nothing scheduled.');
  if (n.sent === n.key) return log('Already sent.');
  if (now < n.at) return log('Not due yet.');
  if (n.event ? now > n.event - GRACE : now - n.at > 30 * 60e3) return log('Too late to be useful, skipping.');

  const l = await fetch(url(famPath + '/subs', 'pageSize=50&'));
  if (!l.ok) return log('Could not read subscriptions (HTTP ' + l.status + '), will retry next run.');
  const subs = ((await l.json()).documents || [])
    .map((d) => {
      try {
        return { id: d.name.split('/').pop(), sub: JSON.parse(val(d.fields.sub)) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const mins = Math.max(5, Math.round((n.event - now) / 60e3 / 5) * 5);
  const body = n.event ? `${n.label} in ${mins} min (~${n.time})` : n.text || 'Notifications work';
  const payload = JSON.stringify({ title: 'Nap Log', body, tag: 'naplog' });

  let ok = 0,
    failed = 0;
  const dead = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.sub, payload, { TTL: 1800, urgency: 'high' });
      ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410)
        dead.push(s.id); // phone unsubscribed or app removed
      else {
        failed++;
        log('Push failed with status ' + (e.statusCode || 'error'));
      }
    }
  }
  for (const id of dead) await fetch(url(`${famPath}/subs/${id}`), { method: 'DELETE' }).catch(() => {});
  // tell the phones which subscriptions the push service rejected: a phone that still holds one of them throws it away
  // and subscribes again the next time the app opens (a phone can keep using a subscription the service has dropped)
  for (const id of dead) {
    await fetch(url(famPath, `updateMask.fieldPaths=${encodeURIComponent('deadSubs.`' + id + '`')}&`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { deadSubs: { mapValue: { fields: { [id]: { integerValue: String(now) } } } } } }),
    }).catch(() => {});
  }

  // mark as handled unless every attempt failed for a temporary reason (then the next run retries)
  if (ok > 0 || subs.length === 0 || failed === 0) {
    await fetch(url(famPath, 'updateMask.fieldPaths=notifySent&'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { notifySent: { stringValue: n.key } } }),
    });
  }
  log(`Sent ${ok}, failed ${failed}, removed ${dead.length} dead subscription(s) of ${subs.length}.`);
}

main().catch((e) => {
  log('Unexpected error: ' + (e && e.message));
});
