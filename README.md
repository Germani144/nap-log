# Nap Log

A small web app for tracking a baby's naps and night sleep, shared between two phones.
It suggests today's naps and bedtime from the past week and can send a push notification
about 30 minutes before the next nap or bedtime.

Live at **https://germani144.github.io/nap-log/**. Open it in Chrome (Android) or Safari (iPhone) and add it to the home screen.

## Files

| File | What it does |
|---|---|
| `index.html` | The app: markup, styles, screen drawing, sync and push |
| `plan.js` | The plan maths: averages, today's suggested naps and bedtime (`makePlan`). No screen code |
| `sw.js` | Service worker: offline cache (network first) and push notification display |
| `manifest.json` | Install info: name, icons, colours |
| `icon-*.png` | App icons (background must stay `#1F2358`, the app colour, or Android shows a square on the launch screen) |
| `badge-96.png` | White moon shown as the small icon on notifications (Android draws it in one colour) |
| `sender/notify.mjs` | Sends the push notifications (run by GitHub Actions) |
| `.github/workflows/notify.yml` | Runs the sender every 5 minutes (GitHub often runs it much less often) |
| `tests/plan.test.mjs` | Tests for the plan maths |
| `tools/backtest.mjs` | Replays a logged history through the plan maths and reports the prediction error |
| `tools/accuracy.mjs` | Reports the real-world accuracy of each app version from the saved predictions (`pred`) |
| `CLAUDE.md` | Working notes for Claude sessions on this repo |

## How sharing works

There is no login. Both phones enter the same **family code** in Settings, and the app syncs through
Firebase Firestore (free plan) under `families/{code}`:

- `families/{code}`: settings (`targetNaps`, `bedtime`), extra naps added to today's plan (`extraNaps`) and the next
  planned notification (`notify*` fields)
- `families/{code}/entries/{id}`: `{id, type: 'nap' | 'night', start, end, pred}` with times in milliseconds; `end` is `null` while sleeping.
  `pred` (from v2.15 on every new or re-timed entry, whether started with a button or filled in later): what the app
  would have predicted just before it started, from the history logged before it,
  `{s: predicted start, len: predicted length in minutes, n: nap number, v: app version}`. Used to measure real-world accuracy.
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

Timing: GitHub's own scheduler often runs the job only every few hours, so an external timer on cron-job.org starts
the workflow every 5 minutes through the workflow dispatch API (`POST .../actions/workflows/notify.yml/dispatches`
with body `{"ref":"main"}`), using a fine-grained GitHub token limited to this repo with Actions read/write. The token
lives only in cron-job.org. GitHub's schedule stays on as a backup; doubles are harmless because each notification is
sent once (`notifySent`) and runs never overlap (`concurrency`). If notifications stop, check the cron-job.org history
first: an expired token shows up there as HTTP 401.

On iPhone, push only works when the app is opened from its home-screen icon (iOS 16.4 or later).

## How the plan works

The full explanation is in the app under **How the plan works**. In short:

- **Next nap** = end of the previous sleep + her usual awake window before that nap (past 7 days,
  recent days weighted more: a day's weight halves every 4 days). Awake windows are kept between 30 min and 3h 30m.
- **Catch-up** after short naps stretches the remaining naps to at most 1.5× their usual length (and 3 h). If 15+ min are
  still missing, an **extra ("bridge") nap** of 30–45 min is suggested halfway between the last nap and the target bedtime,
  only with 75 min to 3h 30m awake on each side; bedtime then stays on target.
- A suggested extra nap shows as a pulsing dashed bubble with a + on the ring and an "Extra nap? ＋ Add" row; tapping
  either adds it. The ring then animates from the old plan to the new one (`animatePlan`); the same happens after editing
  or deleting an entry (`markAnim` before the change, the animation runs on the next render).
- **＋ Add extra nap** adds a nap to today's plan without times (family document field `extraNaps: {day, n}`, today
  only); the plan re-times the remaining naps. **＋ Log a nap** enters real times.
- A nap number with **no data** in the past 7 days is planned like a bridge nap: at most 45 min (or the last nap
  number's usual length), halfway between the previous nap and bedtime.
- **Nap in progress** gets a target length: today's nap-time target − naps already done today − the usual length of
  the naps still to come, kept between 20 min and 3 h. Shown as "target +x min" / "past target by x min". The plan assumes
  she wakes at the target; past it, everything is planned from now.
- **Nap length** = the usual length of that nap, lengthened if earlier naps were short so the day reaches the
  usual total nap time (a nap is never stretched beyond 3 hours).
- **Bedtime** = the target bedtime, allowed to move 30 min either way to respect the awake limits, leaning about a
  third towards "end of last nap + usual gap before bedtime".
- **Night ring** = expected night length is the average of the nights in the past 8 days.

These choices were backtested on the logged history (46 days, predicting each day from the days before it):
next-nap error went from about 45 to 16 minutes, bedtime from about 25 to 20 minutes (`tools/backtest.mjs`).
The 1.5× catch-up cap and the extra nap (v2.16) brought the next nap to about 15.2 and bedtime to about 19.7 minutes.
The target for the nap in progress (v2.11) was checked the same way 30 minutes into each nap: bedtime predicted during
the last nap went from about 25 to 22 minutes off, the next nap from about 27.7 to 28.4 minutes (a small cost).

## Tests and backtest

```
TZ=Europe/Copenhagen node --test tests/plan.test.mjs
TZ=Europe/Copenhagen node tools/backtest.mjs history.json
TZ=Europe/Copenhagen node tools/accuracy.mjs history.json
```

`makePlan(entries, now, settings)` in `plan.js` is pure: it only uses its inputs, so tests can feed it any history
and any "now". `index.html` only draws what it returns. The backtest needs an export of the logged entries (a JSON
array of `{id, type, start, end}`); it holds personal data, so keep it out of the repo (`history*.json` is ignored).
Run both before and after changing the plan logic.

The backtest replays history with today's code and settings. `accuracy.mjs` instead uses the predictions saved
with each entry (`pred`, worked out from what was logged before it), so it also reflects old settings and versions, and shows how often naps start
before or after the suggestion (a hint of how much the suggestions steer you).

## Notes for changing the code

- Every release gets a version number `vMAJOR.MINOR` (minor +1 per release, major for big redesigns). Set it in two
  places: `VER` in `index.html` (shown next to the title, so you can see which version a phone is running, and saved
  with each prediction) and the cache name in `sw.js` (`nap-v2.23`), or phones keep showing the old version.
- Plan logic goes in `plan.js`, screen code in `index.html`. Add a test for any change to the plan.
- In Firestore REST `commit` writes, the document `name` must contain the family code **raw**, not URL-encoded
  (the code has spaces). In URL paths it must be encoded.
- The ring is drawn as inline SVG in `render()` (`index.html`). A nap bar is a capsule only when at least 30px long, and gets the
  💤 at full size from 38px long; shorter naps (and dots) get a smaller 💤 that fits inside them.
  Suggested naps get their expected start and end times written along the ring; a label is skipped when it would
  collide with another label or the sun/moon discs, and nap times take priority over the current-time label.
- A nap in progress is a dotted outline up to its target end, filling up as she sleeps.
- Logged naps, the sun (wake-up) and the moon (bedtime) on the ring open the same edit box as their plan rows.
- The edit box opens without focusing a time field, so the keyboard only appears when a time is tapped.
- The middle of the ring shows the countdown to the next nap or bedtime, its expected time ("at ~10:29") and the
  awake time underneath.
