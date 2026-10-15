# Nap Log

A small web app for tracking a baby's naps and night sleep, shared between two phones.
It suggests today's naps and bedtime from the past week and can send a push notification
about 30 minutes before the next nap or bedtime.

Live at **https://germani144.github.io/nap-log/**. Open it in Chrome (Android) or Safari (iPhone) and add it to the home screen.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole app: markup, styles and script in one file |
| `sw.js` | Service worker: offline cache (network first) and push notification display |
| `manifest.json` | Install info: name, icons, colours |
| `icon-*.png` | App icons (background must stay `#1F2358`, the app colour, or Android shows a square on the launch screen) |
| `sender/notify.mjs` | Sends the push notifications (run by GitHub Actions) |
| `.github/workflows/notify.yml` | Runs the sender every 5 minutes (GitHub often runs it much less often) |

## How sharing works

There is no login. Both phones enter the same **family code** in Settings, and the app syncs through
Firebase Firestore (free plan) under `families/{code}`:

- `families/{code}`: settings (`targetNaps`, `bedtime`) and the next planned notification (`notify*` fields)
- `families/{code}/entries/{id}`: `{id, type: 'nap' | 'night', start, end}` with times in milliseconds; `end` is `null` while sleeping
- `families/{code}/subs/{id}`: push subscriptions, one per phone

The family code is effectively the password, so it must be long and random, and it is never committed or logged.
The Firebase web key in the code is public by design; the protection comes from the Firestore rules:
**listing the `families` collection must be denied**, otherwise anyone could list every family's code.
Only a single family document (fetched by its code) and its subcollections may be readable.

Without a family code the app runs in local-only mode (data stays on that phone).

Live sync covers the last 14 days. Older months are loaded on demand in History.
Everything read from Firestore or local storage is validated before use (`okE`, `okS` in `index.html`),
because the page builds HTML from it.

## Push notifications

1. The app works out the next nap or bedtime and writes "notify at T minus 30 min" into the family document.
2. The GitHub Action runs `sender/notify.mjs`, which reads that document and, when it is due, sends a web push
   (VAPID) to every saved subscription. Dead subscriptions are removed.
3. Secrets live only in the repo's Actions secrets: `FAMILY_CODE` and `VAPID_PRIVATE_KEY`. The repo is public,
   so the sender only logs counts, never codes or times.

Known limitation: GitHub's scheduler often runs the job only every few hours, so notifications can arrive late
or not at all. Planned fix: an external trigger (for example cron-job.org calling the workflow dispatch API with a
fine-grained token limited to this repo).

On iPhone, push only works when the app is opened from its home-screen icon (iOS 16.4 or later).

## How the plan works

The full explanation is in the app under **How the plan works**. In short:

- **Next nap** = end of the previous sleep + her usual awake window before that nap (past 7 days,
  recent days weighted more: a day's weight halves every 4 days). Awake windows are kept between 30 min and 3h 30m.
- **Nap length** = the usual length of that nap, lengthened if earlier naps were short so the day reaches the
  usual total nap time (a nap is never stretched beyond 3 hours).
- **Bedtime** = the target bedtime, allowed to move 30 min either way to respect the awake limits, leaning about a
  third towards "end of last nap + usual gap before bedtime".
- **Night ring** = expected night length is the average of the nights in the past 8 days.

These choices were backtested on the logged history (46 days, predicting each day from the 7 days before it):
next-nap error went from about 45 to 16 minutes, bedtime from about 25 to 20 minutes.

## Notes for changing the code

- Bump the cache name in `sw.js` (`nap-vN`) with every release, or phones keep showing the old version.
- In Firestore REST `commit` writes, the document `name` must contain the family code **raw**, not URL-encoded
  (the code has spaces). In URL paths it must be encoded.
- The ring is drawn as inline SVG in `render()`. A nap bar is a capsule only when at least 30px long, and gets the
  💤 only when at least 38px long; shorter naps are plain dots.
