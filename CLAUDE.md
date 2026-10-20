# Notes for Claude

- Scope: work only in this repository (Germani144/nap-log). Do not clone, attach or change any other repository
  from a nap-log session. Each of Pedro's apps has its own chat.
- Read README.md first: it explains sync, push, the plan logic and the gotchas.
- Never commit, print or log the family code or the VAPID private key. They live only in GitHub Actions secrets.
- Keep README.md up to date: update it in the same commit whenever a change affects what it describes.
- Same for the in-app "How the plan works" section (`#algo` in index.html): update it whenever the logic or the
  screen it explains changes.
- Plan logic lives in plan.js (pure, tested). Run `TZ=Europe/Copenhagen node --test tests/*.test.mjs` before pushing.
- Every release: bump the version (minor +1) in both `VER` in index.html and the cache name in sw.js (`nap-log-vX.Y`). They must match.
- Commit and push to main after each change; the app is served by GitHub Pages from main.

## Shared origin (all of Pedro's apps live on germani144.github.io)

Every app is served from the same origin, so they share one CacheStorage, one localStorage and one IndexedDB namespace. Keep these rules. Changes that apply to every app at once (caching and the like) are made from Pedro's orchestration chat; they never touch UI or calculations.

- **Service worker:** Cache names start with `nap-log-` (`nap-log-vX.Y`; its old `nap-v…` names are also cleaned up). On activate, delete only caches with that prefix (never "every cache but the current one"). Read from this app's own cache (`caches.open(C).then(c => c.match(...))`), never the global `caches.match()`. Only handle requests whose URL starts with `self.registration.scope`; leave other apps, the GitHub API and other origins alone.
- **Updates:** fetch network-first with `{cache: 'no-cache'}`, store only `r.ok` responses, fall back to this app's own cache when offline. Register the worker with `{scope: './', updateViaCache: 'none'}`.
- **Storage:** every `localStorage` key starts with `nap-log.` (use `load`/`save`, or `lsGet`/`lsSet`/`lsDel`). Older builds used `nt_`; that move happens once at startup.
- **Manifest:** `scope` and `start_url` are `./`. `id` is unique to this app and stays stable: changing it makes phones treat the app as a new install, so only do it deliberately.
- `tests/sw.test.mjs` and `tests/storage.test.mjs` check these rules; keep them passing.
- Keep Firebase initialised as it is (the default app): another app on the origin uses a differently named app in the same project, which is what keeps their offline databases apart.
- The manifest `id` is `nap-log-v2`.
