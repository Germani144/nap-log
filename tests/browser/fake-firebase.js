// A tiny stand-in for the Firebase compat SDK (firebase-app-compat + firebase-firestore-compat), loaded by the
// browser tests instead of the real scripts from gstatic.com. It covers exactly what Nap Log uses: doc/collection
// refs, set (with merge), delete, where('start', '>=' | '<', n), onSnapshot, get, batch and FieldValue.delete().
//
// The data lives in the test runner (tests/browser/harness.mjs, class FakeFirestore), so two "phones" (two browser
// contexts) share one family log, like real Firestore. Each page keeps a mirror: writes apply to it at once (like
// Firestore's latency compensation) and are then sent to the runner, which applies them and pushes the new state to
// every page.
(() => {
  const DELETE = { __fsDelete: true };
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // the same rules as the runner's applyOps (keep them in sync)
  function mergeInto(target, src) {
    for (const [k, v] of Object.entries(src)) {
      if (v && v.__fsDelete) delete target[k];
      else if (isMap(v)) {
        if (!isMap(target[k])) target[k] = {};
        mergeInto(target[k], v);
      } else target[k] = clone(v);
    }
  }
  function applyOps(docs, ops) {
    for (const o of ops) {
      if (o.op === 'delete') delete docs[o.path];
      else if (o.merge && isMap(docs[o.path])) mergeInto(docs[o.path], o.data);
      else {
        docs[o.path] = {};
        mergeInto(docs[o.path], o.data);
      }
    }
  }

  let mirror = {};
  let loaded = null;
  const listeners = new Set();
  const load = () => (loaded ??= window.__fsDump().then((s) => (mirror = s)));
  const fire = () => [...listeners].forEach((l) => l());
  window.__fsSync = (state) => {
    mirror = state;
    fire();
  };
  async function write(ops) {
    await load();
    applyOps(mirror, clone(ops));
    queueMicrotask(fire);
    await window.__fsCommit(clone(ops));
  }
  function listen(fn) {
    const l = () => fn();
    listeners.add(l);
    load().then(() => listeners.has(l) && setTimeout(l, 0));
    return () => listeners.delete(l);
  }
  const docSnap = (path) => ({ id: path.split('/').pop(), exists: path in mirror, data: () => clone(mirror[path]) });

  class DocRef {
    constructor(path) {
      this.path = path;
      this.id = path.split('/').pop();
    }
    collection(name) {
      return new Query(this.path + '/' + name, []);
    }
    set(data, opts) {
      return write([{ op: 'set', path: this.path, data: clone(data), merge: !!(opts && opts.merge) }]);
    }
    delete() {
      return write([{ op: 'delete', path: this.path }]);
    }
    get() {
      return load().then(() => docSnap(this.path));
    }
    onSnapshot(cb) {
      return listen(() => cb(docSnap(this.path)));
    }
  }
  const test = { '>=': (a, b) => a >= b, '<': (a, b) => a < b, '==': (a, b) => a === b };
  class Query {
    constructor(path, filters) {
      this.path = path;
      this.filters = filters;
    }
    doc(id) {
      return new DocRef(this.path + '/' + id);
    }
    where(field, op, value) {
      if (!test[op]) throw new Error('fake firestore: unsupported operator ' + op);
      return new Query(this.path, [...this.filters, [field, op, value]]);
    }
    snap() {
      const pre = this.path + '/';
      const docs = Object.keys(mirror)
        .filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
        .sort()
        .map((k) => ({ id: k.slice(pre.length), data: () => clone(mirror[k]) }))
        .filter((d) => this.filters.every(([f, op, v]) => test[op](d.data()[f], v)));
      return { docs, size: docs.length, empty: !docs.length };
    }
    get() {
      return load().then(() => {
        if (window.__fsOffline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
        return this.snap();
      });
    }
    onSnapshot(cb) {
      return listen(() => cb(this.snap()));
    }
  }
  const db = {
    collection: (name) => new Query(name, []),
    enablePersistence: () => Promise.resolve(),
    batch() {
      const ops = [];
      return {
        set: (ref, data) => ops.push({ op: 'set', path: ref.path, data: clone(data), merge: false }),
        delete: (ref) => ops.push({ op: 'delete', path: ref.path }),
        commit: () => write(ops),
      };
    },
  };
  const firestore = () => db;
  firestore.FieldValue = { delete: () => DELETE };
  window.firebase = {
    apps: [],
    initializeApp(config) {
      const app = { name: '[DEFAULT]', options: config };
      this.apps.push(app);
      return app;
    },
    firestore,
  };
})();
