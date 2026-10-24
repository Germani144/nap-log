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
- Plan logic lives in plan.js (pure, tested). Run `TZ=Europe/Copenhagen node --test tests/*.test.mjs` before pushing.
- Every release: bump the version (minor +1) in both `VER` in index.html and the cache name in sw.js (`nap-log-vX.Y`). They must match.
- Commit and push to main after each change; the app is served by GitHub Pages from main.

## Security rules

- `index.html` has a Content-Security-Policy. Keep it: if a feature needs another address, add exactly that address to the right directive and say so in the README. Never add `*` or broad wildcards.
- Anything synced, typed in or imported goes through validation (`okE`/`okS` in backup.js, `Backup.parseImport` for files) and `esc()` before it is put into HTML.
- Exports never contain the family code. If the export layout changes, raise `Backup.VERSION` and keep importing older versions (add a test).
- Every Firestore request from `sender/` keeps the `Referer` header (the web key may be restricted to the app's address).

## Address and shared-origin rules

Nap Log lives at https://germani144.github.io/nap-log/.

**One installable app per address.** Chrome on Android lets only one app per address (origin) be installed: a second app on the same address shows "This app is already installed" and can't be installed (found 2026-10-20). So every app Pedro installs needs its own address. Nap Log is the installed app on `germani144.github.io`; Lift Log moved to `germani144-lift.github.io`, Home log to `germani144-home.github.io` and RideGuide to `germani144-ride.github.io` (each its own free GitHub organization). Changes that apply to every app at once are made from Pedro's orchestration chat; they never touch UI or calculations. Never add another installable app to `germani144.github.io`. The rules below still apply, so Nap Log stays clean if another app ever shares the address.

- **Service worker:** Cache names start with `nap-log-` (`nap-log-vX.Y`; its old `nap-v…` names are also cleaned up). On activate, delete only caches with that prefix (never "every cache but the current one"). Read from this app's own cache (`caches.open(C).then(c => c.match(...))`), never the global `caches.match()`. Only handle requests whose URL starts with `self.registration.scope`; leave other apps, the GitHub API and other origins alone.
- **Updates:** fetch network-first with `{cache: 'no-cache'}`, store only `r.ok` responses, fall back to this app's own cache when offline. Register the worker with `{scope: './', updateViaCache: 'none'}`.
- **Storage:** every `localStorage` key starts with `nap-log.` (use `load`/`save`, or `lsGet`/`lsSet`/`lsDel`). Older builds used `nt_`; that move happens once at startup.
- **Manifest:** `scope` and `start_url` are `./`. **Never change the manifest `id`**, not even to fix an install problem, unless Pedro explicitly asks for it in that chat. The id is how Android recognises the installed app: changing it orphans the installed copy. If installing fails on the phone, investigate and report; don't change the id.
- `tests/sw.test.mjs` and `tests/storage.test.mjs` check these rules; keep them passing.
- Keep Firebase initialised as it is (the default app). Home log uses the same Firebase project as a differently named app (`cart-log`), now on its own address.
- The manifest `id` is `nap-log-v2`.
