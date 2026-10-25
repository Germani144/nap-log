// All of Pedro's apps share one origin (germani144.github.io), so they share CacheStorage: this worker only ever
// touches caches with its own prefix, and only handles requests inside its own scope (/nap-log/).
// Older versions' "Check for updates" read the version with /C=P\+'v([\d.]+)'/, so this line keeps exactly this shape.
// prettier-ignore
const P='nap-log-',C=P+'v3.18';
const mine = (k) => k.startsWith(P) || /^nap-v\d/.test(k); // 'nap-v…' = this app's cache names before v3.4
// The app's own files, saved at install so it opens offline. Every local file index.html loads must be listed here
// (tests/sw.test.mjs checks it).
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'plan.js',
  'backup.js',
  'js/core.js',
  'js/config.js',
  'js/storage.js',
  'js/state.js',
  'js/sync.js',
  'js/entries.js',
  'js/ring.js',
  'js/today.js',
  'js/edit-dialog.js',
  'js/notify.js',
  'js/stats.js',
  'js/tabs.js',
  'js/history.js',
  'js/settings.js',
  'js/backup-ui.js',
  'js/main.js',
];
// Opening the app never waits for the network: every app file comes from this version's cache, so a phone always runs
// one complete version and it opens instantly, even offline. The browser checks sw.js itself for changes (registered
// with updateViaCache: 'none', and main.js asks again whenever the app comes back to the screen). A new release changes
// the cache name above, so the new worker downloads every file fresh into a new cache before it takes over; main.js
// then reloads the page once. (Network-first made every open wait for one round trip per file: found 2026-10-25.)
// install: '?v=' makes GitHub's CDN fetch each file anew and cache: 'reload' skips the phone's HTTP cache, so a release
// can never mix in an old copy. If any file fails, the install fails and the phone stays on the current version.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(C).then((c) =>
      Promise.all(
        APP_FILES.map(async (u) => {
          const r = await fetch(u + '?v=' + C, { cache: 'reload', credentials: 'same-origin' });
          if (!r.ok) throw new Error('could not save ' + u + ' for offline use');
          await c.put(u, r);
        }),
      ),
    ),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => mine(k) && k !== C).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  if (new URL(e.request.url).searchParams.has('check')) return; // "Check for updates": straight to the server, never cached
  e.respondWith(cacheFirst(e.request));
});
// From this version's cache; anything not in it (e.g. an icon) comes from the server once ('no-cache': revalidated,
// not GitHub's 10-minute HTTP cache) and is kept if it worked. Opening the app with a query string still finds the app.
async function cacheFirst(req) {
  const c = await caches.open(C);
  const nav = req.mode === 'navigate';
  const hit = (await c.match(req, { ignoreSearch: nav })) || (nav && (await c.match('./index.html')));
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (r.ok) await c.put(req, r.clone());
    return r;
  } catch {
    return Response.error();
  }
}

// ---- push notifications (sent by sender/notify.mjs through GitHub Actions)
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data.json();
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Nap Log', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'badge-96.png',
      tag: d.tag || 'naplog',
      renotify: true,
    }),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
      for (const c of l) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); // not another app's tab
      return clients.openWindow('./');
    }),
  );
});
