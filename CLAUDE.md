# Notes for Claude

- Scope: work only in this repository (Germani144/nap-log). Do not clone, attach or change any other repository
  from a nap-log session. Each of Pedro's apps has its own chat.
- Read README.md first: it explains sync, push, the plan logic and the gotchas.
- Never commit, print or log the family code or the VAPID private key. They live only in GitHub Actions secrets.
- Keep README.md up to date: update it in the same commit whenever a change affects what it describes.
- Plan logic lives in plan.js (pure, tested). Run `TZ=Europe/Copenhagen node --test tests/plan.test.mjs` before pushing.
- Bump the cache name in sw.js with every release.
- Commit and push to main after each change; the app is served by GitHub Pages from main.
