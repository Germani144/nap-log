// Runs a service worker file (sw.js) in a fake worker environment and checks that it behaves on a shared origin:
// it may only touch its own caches and its own folder. Used by sw.test.mjs; written so it works for any app's sw.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const ORIGIN = 'https://germani144.github.io';

// Cache names every app on the origin uses (current and old), so each app can be checked against the others.
export const APPS = {
  'cart-log': { prefix: 'cart-log-', names: ['cart-log-1.5', 'cart-v5', 'cart-1.2'] },
  'lift-log': { prefix: 'lift-log-', names: ['lift-log-dbd6c69d1d', 'liftlog-1.0'] },
  'nap-log': { prefix: 'nap-log-', names: ['nap-log-v3.6', 'nap-v2.27'] },
  'ride-guide': { prefix: 'rideguide-', names: ['rideguide-v5'] },
};

class FakeResponse {
  constructor(body = '', { status = 200 } = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
  clone() {
    return this;
  }
  static error() {
    const r = new FakeResponse('', { status: 0 });
    r.ok = false;
    r.isError = true;
    return r;
  }
}

function makeEnv(scope) {
  const net = { offline: false, status: {}, calls: [] };
  const state = { globalMatchUsed: false, listeners: {} };
  const urlOf = (r) => (typeof r === 'string' ? new URL(r, scope).href : r.url);
  const bare = (u) => u.split('#')[0].split('?')[0];

  class FakeRequest {
    constructor(input, init = {}) {
      this.url = urlOf(input);
      this.method = init.method || (typeof input === 'object' && input.method) || 'GET';
      this.mode = init.mode || (typeof input === 'object' && input.mode) || 'cors';
      this.cache = init.cache;
    }
  }
  const fetch = async (input, init = {}) => {
    const url = urlOf(input);
    net.calls.push({ url, init });
    if (net.offline) throw new TypeError('offline');
    return new FakeResponse('net:' + url, { status: net.status[url] ?? 200 });
  };

  const store = new Map(); // cache name -> Map(url -> response)
  const find = (m, req, opts = {}) => {
    const u = urlOf(req);
    if (m.has(u)) return m.get(u);
    if (opts.ignoreSearch) for (const [k, v] of m) if (bare(k) === bare(u)) return v;
    return undefined;
  };
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (n) => store.delete(n),
    has: async (n) => store.has(n),
    match: async () => {
      state.globalMatchUsed = true;
      throw new Error('global caches.match() used');
    },
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        put: async (r, res) => {
          m.set(urlOf(r), res);
        },
        match: async (r, o) => find(m, r, o),
        addAll: async (rs) => {
          for (const r of rs) {
            const res = await fetch(r);
            if (!res.ok) throw new Error('addAll ' + urlOf(r));
            m.set(urlOf(r), res);
          }
        },
        keys: async () => [...m.keys()].map((u) => ({ url: u })),
        delete: async (r) => m.delete(urlOf(r)),
      };
    },
  };

  const clients = { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} };
  const self = {
    addEventListener: (type, fn) => {
      (state.listeners[type] ||= []).push(fn);
    },
    registration: { scope, showNotification: async () => {} },
    skipWaiting: async () => {},
    clients,
  };
  const ctx = {
    self,
    caches,
    fetch,
    Request: FakeRequest,
    Response: FakeResponse,
    URL,
    clients,
    location: { origin: ORIGIN },
    setTimeout,
    clearTimeout,
    AbortController,
    console,
    Promise,
  };
  return { ctx, net, store, state, caches, FakeRequest, fetch };
}

async function fire(state, type, ev) {
  const waits = [];
  let responded = false,
    response,
    error;
  ev.waitUntil = (p) => {
    waits.push(p);
  };
  ev.respondWith = (p) => {
    responded = true;
    response = p;
  };
  for (const fn of state.listeners[type] || []) fn(ev);
  await Promise.all(waits);
  if (responded) {
    try {
      response = await response;
    } catch (e) {
      error = e;
      response = undefined;
    }
  }
  return { responded, response, error };
}

// Returns a list of { name, pass, detail } checks.
export async function checkSw({ swPath, repo }) {
  const app = APPS[repo];
  const scope = `${ORIGIN}/${repo}/`;
  const env = makeEnv(scope);
  vm.runInNewContext(readFileSync(swPath, 'utf8'), env.ctx, { filename: swPath });
  const out = [];
  const add = (name, pass, detail = '') => out.push({ name, pass: !!pass, detail });
  const req = (url, extra = {}) => new env.FakeRequest(url, { method: 'GET', ...extra });

  // 1. install: opens exactly one cache and it carries this app's prefix
  await fire(env.state, 'install', {});
  const created = [...env.store.keys()];
  const own = created[0];
  add(
    'install creates one cache with its own prefix',
    created.length === 1 && own.startsWith(app.prefix),
    created.join(','),
  );

  // 2. activate: delete only this app's old caches
  const foreign = [
    ...Object.entries(APPS)
      .filter(([k]) => k !== repo)
      .flatMap(([, a]) => a.names),
    'workbox-precache-v2',
  ];
  const stale = app.prefix + '0.0-stale';
  for (const n of [...foreign, stale])
    env.store.set(n, new Map([[scope.replace(repo, 'x') + 'marker', new FakeResponse('keep:' + n)]]));
  await fire(env.state, 'activate', {});
  const left = [...env.store.keys()];
  add(
    "activate keeps every other app's caches",
    foreign.every((n) => left.includes(n)),
    'lost: ' + foreign.filter((n) => !left.includes(n)).join(','),
  );
  add('activate removes its own stale cache', !left.includes(stale));
  add('activate keeps its current cache', left.includes(own));

  // 3. requests outside its folder or origin are left alone
  const otherApp = `${ORIGIN}/${repo === 'nap-log' ? 'lift-log' : 'nap-log'}/index.html`;
  let r = await fire(env.state, 'fetch', { request: req(otherApp) });
  add("ignores another app's files", !r.responded);
  r = await fire(env.state, 'fetch', { request: req('https://api.github.com/repos/x/y/contents/z') });
  add('ignores other origins (e.g. the GitHub API)', !r.responded);
  r = await fire(env.state, 'fetch', { request: req(scope + 'x.json', { method: 'POST' }) });
  add('ignores non-GET requests', !r.responded);

  // 4. online: network first with revalidation, success is stored in its own cache
  const fresh = scope + 'fresh.js';
  env.net.calls.length = 0;
  r = await fire(env.state, 'fetch', { request: req(fresh) });
  await new Promise((res) => setTimeout(res, 5));
  add(
    'online: answers from the network',
    r.responded && r.response && r.response.ok && r.response.body === 'net:' + fresh,
  );
  add(
    'online: asks the server to revalidate (no-cache)',
    env.net.calls.some((c) => c.url === fresh && c.init.cache === 'no-cache'),
  );
  add(
    'online: stores the copy in its own cache only',
    (await (await env.caches.open(own)).match(fresh)) !== undefined &&
      !left.filter((n) => n !== own).some((n) => env.store.get(n).has(fresh)),
  );

  // 5. a failed response is passed on but never cached
  const gone = scope + 'gone.js';
  env.net.status[gone] = 404;
  r = await fire(env.state, 'fetch', { request: req(gone) });
  await new Promise((res) => setTimeout(res, 5));
  add(
    'a 404 is not cached',
    r.responded && r.response.status === 404 && (await (await env.caches.open(own)).match(gone)) === undefined,
  );

  // 6. offline: own cache only
  env.net.offline = true;
  r = await fire(env.state, 'fetch', { request: req(fresh) });
  add(
    'offline: serves its cached copy',
    r.responded && r.response && r.response.body === 'net:' + fresh,
    r.error ? String(r.error) : '',
  );
  const inForeign = scope + 'only-in-foreign.js';
  env.store.get(foreign[0]).set(inForeign, new FakeResponse('FOREIGN'));
  r = await fire(env.state, 'fetch', { request: req(inForeign) });
  add("offline: never serves from another app's cache", !(r.response && r.response.body === 'FOREIGN'));
  r = await fire(env.state, 'fetch', { request: req(scope + '?from=homescreen', { mode: 'navigate' }) });
  add(
    'offline: opening the app (even with a query string) shows the cached app',
    r.responded && r.response && r.response.ok === true,
    r.error ? String(r.error) : '',
  );
  add('never used the global caches.match()', !env.state.globalMatchUsed);

  // 7. other apps' cache contents are unchanged
  const untouched = foreign.every(
    (n) => env.store.get(n) && [...env.store.get(n).values()].every((v) => /^(keep:|FOREIGN)/.test(v.body)),
  );
  add("other apps' cache contents are unchanged", untouched);
  return out;
}
