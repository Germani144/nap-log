// Helpers for the browser tests: a static server for the repo (at /nap-log/, like GitHub Pages), a fake Firestore
// shared by every "phone" in a test, and openPhone(), which opens the app in a mobile-emulated Chromium.
// All data here is made up. Never build a test from a real export.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAKE_SDK = fs.readFileSync(path.join(ROOT, 'tests/browser/fake-firebase.js'), 'utf8');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
export const H = 36e5,
  MIN = 6e4,
  DAY = 864e5;

// ---------- static server ----------
// root: the folder to serve (default: this repo)
export function startServer(root = ROOT) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/nap-log/')) return res.writeHead(404).end();
    let rel = decodeURIComponent(url.pathname.slice('/nap-log/'.length)) || 'index.html';
    const file = path.join(root, rel);
    if (
      !file.startsWith(root + path.sep) ||
      /(^|\/)(\.|node_modules|tests)/.test(rel) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    )
      return res.writeHead(404).end('not found');
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}/nap-log/` })),
  );
}

// ---------- fake Firestore (the data side; tests/browser/fake-firebase.js is the page side) ----------
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function mergeInto(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && v.__fsDelete) delete target[k];
    else if (isMap(v)) {
      if (!isMap(target[k])) target[k] = {};
      mergeInto(target[k], v);
    } else target[k] = structuredClone(v);
  }
}
export class FakeFirestore {
  docs = {};
  pages = new Set();
  writes = [];
  apply(ops) {
    for (const o of ops) {
      this.writes.push(o);
      if (o.op === 'delete') delete this.docs[o.path];
      else if (o.merge && isMap(this.docs[o.path])) mergeInto(this.docs[o.path], o.data);
      else {
        this.docs[o.path] = {};
        mergeInto(this.docs[o.path], o.data);
      }
    }
  }
  async attach(context) {
    await context.exposeBinding('__fsDump', () => this.docs);
    await context.exposeBinding('__fsCommit', async (_src, ops) => {
      this.apply(ops);
      for (const p of this.pages)
        await p.evaluate((s) => window.__fsSync && window.__fsSync(s), this.docs).catch(() => {});
    });
    context.on('page', (p) => {
      this.pages.add(p);
      p.on('close', () => this.pages.delete(p));
    });
  }
  family(code) {
    return this.docs['families/' + code];
  }
  entries(code) {
    const pre = `families/${code}/entries/`;
    return Object.entries(this.docs)
      .filter(([k]) => k.startsWith(pre))
      .map(([, v]) => v)
      .sort((a, b) => a.start - b.start);
  }
  // seeds always store a copy, so a test's own objects are never changed by later writes
  seedDoc(path, data) {
    this.docs[path] = structuredClone(data);
  }
  seedEntries(code, list) {
    for (const e of list) this.docs[`families/${code}/entries/${e.id}`] = structuredClone(e);
  }
}

// ---------- made-up data ----------
// local time on a day relative to `day0` (local midnight): at(day0, -1, 19, 30) = yesterday 19:30
export const at = (day0, d, h, m = 0) => {
  const t = new Date(day0);
  t.setDate(t.getDate() + d);
  t.setHours(h, m, 0, 0);
  return +t;
};
export const midnight = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return +d;
};
// `days` regular made-up days before day0 (wake 06:30, three naps, bed 19:30, small day-to-day variation), plus the
// night that ends on day0's morning unless noLastNight
export function madeUpHistory(day0, days, { noLastNight = false, prefix = 'h' } = {}) {
  const E = [];
  for (let d = -days; d < 0; d++) {
    const v = ((d * 7) % 5) * 3; // 0..12 min, deterministic
    E.push(
      { id: `${prefix}n${-d}`, type: 'night', start: at(day0, d - 1, 19, 30 - (v % 10)), end: at(day0, d, 6, 30 + v) },
      { id: `${prefix}a${-d}`, type: 'nap', start: at(day0, d, 8, 30 + v), end: at(day0, d, 9, 30 + v) },
      { id: `${prefix}b${-d}`, type: 'nap', start: at(day0, d, 12, 0 + v), end: at(day0, d, 13, 20 + v) },
      { id: `${prefix}c${-d}`, type: 'nap', start: at(day0, d, 16, 0 + v), end: at(day0, d, 16, 40 + v) },
    );
  }
  if (!noLastNight) E.push({ id: `${prefix}n0`, type: 'night', start: at(day0, -1, 19, 30), end: at(day0, 0, 6, 30) });
  return E;
}

// ---------- the phones ----------
let browser = null;
export async function launch() {
  browser ??= await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

// Opens the app on a made-up phone. `storage` presets nap-log.* localStorage keys (values are JSON-encoded here)
// on the first load only. `now` fixes the clock (ms). Every console error, page error and Content-Security-Policy
// violation is collected in phone.problems; tests assert it stays empty.
export async function openPhone(
  base,
  { fs: fakeFs, storage = {}, now, device = 'Pixel 7', serviceWorkers = 'block', offlineFonts = true } = {},
) {
  const b = await launch();
  const { defaultBrowserType, ...desc } = devices[device];
  const context = await b.newContext({
    ...desc,
    timezoneId: 'Europe/Copenhagen',
    locale: 'en-GB',
    reducedMotion: 'reduce',
    serviceWorkers,
    acceptDownloads: true,
  });
  if (fakeFs) await fakeFs.attach(context);
  else await context.exposeBinding('__fsDump', () => ({})).then(() => context.exposeBinding('__fsCommit', () => {}));
  await context.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/.*\/firebase-app-compat\.js$/, (r) =>
    r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }),
  );
  await context.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/.*\/firebase-firestore-compat\.js$/, (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (r) =>
    offlineFonts ? r.abort() : r.continue(),
  );
  const preset = Object.fromEntries(Object.entries(storage).map(([k, v]) => ['nap-log.' + k, JSON.stringify(v)]));
  await context.addInitScript((preset) => {
    if (!sessionStorage.getItem('__preset')) {
      sessionStorage.setItem('__preset', '1');
      for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v);
    }
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI || ''} ${e.sample || ''}`),
    );
  }, preset);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/fonts\.(googleapis|gstatic)\.com|ERR_FAILED|net::ERR/.test(t) && !/CSP/.test(t)) return; // fonts are blocked on purpose
    problems.push(t);
  });
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  // alert/confirm: answered from phone.answers (true = OK), recorded in phone.dialogs
  const phone = { context, page, problems, dialogs: [], answers: [] };
  page.on('dialog', async (d) => {
    phone.dialogs.push({ type: d.type(), message: d.message() });
    const yes = phone.answers.length ? phone.answers.shift() : true;
    yes ? await d.accept() : await d.dismiss();
  });
  if (now != null) await page.clock.setFixedTime(now);
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#hero')?.innerHTML.length > 0);
  phone.setTime = (t) => page.clock.setFixedTime(t);
  // innerText with non-breaking spaces (used in durations like "3h 00m") turned into plain spaces
  phone.text = async (sel) => (await page.locator(sel).innerText()).replace(/\u00a0/g, ' ');
  phone.storage = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem('nap-log.' + k)), k);
  phone.row = (label) =>
    page.locator('#plan .it', { has: page.locator('.t', { hasText: new RegExp('^' + label + '$') }) });
  phone.close = () => context.close();
  return phone;
}

// waits until fn() (run in the test) returns truthy, polling; throws with the last value
export async function until(fn, { timeout = 4000, what = 'condition' } = {}) {
  const t0 = Date.now();
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
