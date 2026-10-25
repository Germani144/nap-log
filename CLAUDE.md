# Notes for Claude

- Scope: work only in this repository (Germani144/nap-log). Do not clone, attach or change any other repository
  from a nap-log session. Each of Pedro's apps has its own chat.
- **History was rewritten on 2026-10-22** to remove personal nap data from the public history (main is now b2ca908 or later). At the start of every session, before editing: `git fetch origin && git reset --hard origin/main` (or re-clone). Never push older local commits or branches, and never force-push old history: that would put the data back.
- **Never commit personal data** (nap or sleep exports, CSVs, JSON dumps, analysis output) to this public repo. That includes the app's own export files (`nap-log-YYYY-MM-DD.json`, ignored by `.gitignore`); tests use made-up data only. One-time imports must read the data from a GitHub Actions secret or from the phone, never from a committed file.
- Read README.md first: it explains sync, push, the plan logic and the gotchas.
- Never commit, print or log the family code or the VAPID private key. They live only in GitHub Actions secrets.
- Keep README.md up to date: update it in the same commit whenever a change affects what it describes.
- Same for the in-app "How the plan works" section (`#algo` in index.html): update it whenever the logic or the
  screen it explains changes.
- Every release: bump the version (minor +1) in both `VER` in js/config.js and the cache name in sw.js (`nap-log-vX.Y`). They must match.
- Commit and push to main after each change; the app is served by GitHub Pages from main. A change made in several
  commits is pushed together, with one version bump, so phones never load a half-done state.

## Layout

No build step: GitHub Pages serves the files as they are.

- `index.html`: markup only, then the scripts in order. `styles.css`: all styles.
- `plan.js` (plan maths), `backup.js` (export/import format and the validators), `js/core.js` (small shared helpers):
  pure, no screen, storage, network or clock, each tested in Node. Keep new logic pure and put it here, with a test.
- `js/*.js`: the app, classic scripts sharing one global scope, loaded in the order of the `<script>` tags (README has
  the table). Code that runs at load may only use earlier files.
- Days are not always 24 hours (clock changes): use `addDays` and `timeAtMinute` from plan.js, never `+ DAY` or
  `midnight + minutes * 60000`. tests/clock-change.test.mjs checks both clock changes.
- Taps in generated HTML use `tapAction('name', {...})` and an entry in `ACTIONS` (js/main.js), never `onclick=`.
- A new file needs its `<script>` tag in index.html and its path in `APP_FILES` in sw.js (tests/sw.test.mjs checks).
- The cache-name line in sw.js keeps exactly the shape `const P='nap-log-',C=P+'vX.Y';` under `// prettier-ignore`:
  older versions' Check for updates parse it with a regex (tests/version.test.mjs checks).
- `makePlan`'s return keys (`B`, `bt`, `tn`, `wk0`, …) are kept as they are; they are listed above its `return`.

## Tests (run before every push)

```
TZ=Europe/Copenhagen node --test tests/*.test.mjs                                        # unit tests
npm install && TZ=Europe/Copenhagen node --test --test-concurrency=1 tests/browser/*.test.mjs   # browser tests
npx prettier --check .                                                                  # formatting
```

- Browser tests run the real app in mobile-emulated Chromium with a fixed clock and a fake Firestore
  (tests/browser/harness.mjs, fake-firebase.js); they fail on any console error or CSP violation. In a fresh cloud
  session Chromium may already be installed (PLAYWRIGHT_BROWSERS_PATH); otherwise `npx playwright install chromium`.
- Add a test with every change: a unit test for logic, a browser test for anything on screen. Test data is made up.
- Changing plan.js: also run the backtest (`tools/backtest.mjs`) on an export kept outside the repo.

## Security rules

- `index.html` has a Content-Security-Policy with no `'unsafe-inline'` for scripts: never add inline `<script>` or `onclick=` code (use `data-act` + `tapAction()`, run by `ACTIONS` in js/main.js). Keep it: if a feature needs another address, add exactly that address to the right directive and say so in the README. Never add `*` or broad wildcards.
- Anything synced, typed in or imported goes through validation (`isValidEntry`/`cleanSettings` in backup.js, `Backup.parseImport` for files) and `escapeHtml()` before it is put into HTML.
- Exports never contain the family code. If the export layout changes, raise `Backup.VERSION` and keep importing older versions (add a test).
- Every Firestore request from `sender/` keeps the `Referer` header (the web key may be restricted to the app's address).

## Address and shared-origin rules

Nap Log lives at https://germani144.github.io/nap-log/.

**One installable app per address.** Chrome on Android lets only one app per address (origin) be installed: a second app on the same address shows "This app is already installed" and can't be installed (found 2026-10-20). So every app Pedro installs needs its own address. Nap Log is the installed app on `germani144.github.io`; Lift Log moved to `germani144-lift.github.io`, Home log to `germani144-home.github.io` and RideGuide to `germani144-ride.github.io` (each its own free GitHub organization). Changes that apply to every app at once are made from Pedro's orchestration chat; they never touch UI or calculations. Never add another installable app to `germani144.github.io`. The rules below still apply, so Nap Log stays clean if another app ever shares the address.

- **Service worker:** Cache names start with `nap-log-` (`nap-log-vX.Y`; its old `nap-v…` names are also cleaned up). On activate, delete only caches with that prefix (never "every cache but the current one"). Read from this app's own cache (`caches.open(C).then(c => c.match(...))`), never the global `caches.match()`. Only handle requests whose URL starts with `self.registration.scope`; leave other apps, the GitHub API and other origins alone.
- **Updates (cache-first, same in all of Pedro's apps since 2026-10-25):** open the app from this version's own cache, never network-first (with many files it made every open wait for one round trip per file). The install downloads every app file fresh (`?v=` plus `cache: 'reload'`) into the new version's cache and fails as a whole if one file fails; files not in the cache are fetched with `{cache: 'no-cache'}`; store only `r.ok` responses. Register the worker with `{scope: './', updateViaCache: 'none'}`, call `reg.update()` on every start and when the app becomes visible, and reload once on `controllerchange` (not on the first install, not while a field is focused). So a release only reaches phones if the version in the cache name changes.
- **Storage:** every `localStorage` key starts with `nap-log.` (use `load`/`save`, or `lsGet`/`lsSet`/`lsDel`). Older builds used `nt_`; that move happens once at startup.
- **Manifest:** `scope` and `start_url` are `./`. **Never change the manifest `id`**, not even to fix an install problem, unless Pedro explicitly asks for it in that chat. The id is how Android recognises the installed app: changing it orphans the installed copy. If installing fails on the phone, investigate and report; don't change the id.
- `tests/sw.test.mjs` and `tests/storage.test.mjs` check these rules; keep them passing.
- Keep Firebase initialised as it is (the default app). Home log uses the same Firebase project as a differently named app (`cart-log`), now on its own address.
- The manifest `id` is `nap-log-v2`.
