# Nap Log

A small web app for tracking a baby's naps and night sleep, shared between two phones.
It suggests today's naps and bedtime from the past week and can send a push notification
about 30 minutes before the next nap or bedtime.

Live at **https://germani144.github.io/nap-log/**. Open it in Chrome (Android) or Safari (iPhone) and add it to the home screen. Chrome on Android installs only one app per address, so Nap Log is the only installable app on `germani144.github.io`; Pedro's other apps have their own addresses.

## Files

| File | What it does |
|---|---|
| `index.html` | The app: markup, styles, screen drawing, sync and push |
| `plan.js` | The plan maths: averages, today's suggested naps and bedtime (`makePlan`). No screen code |
| `backup.js` | Export/import file format and checks (`Backup`), and the validators `okE` (entries) and `okS` (settings). No screen code |
| `sw.js` | Service worker: always fetches the newest files (no-cache revalidation), keeps a copy for offline use, shows push notifications. It is the only app on `germani144.github.io` now, but it still only touches caches named `nap-log-…` (plus its old `nap-v…` ones), reads only from its own cache, only stores successful responses, only handles requests inside `/nap-log/`, and a notification tap only focuses a Nap Log tab |
| `manifest.json` | Install info: name, icons, colours. `start_url` and `scope` are `./` (only `/nap-log/`, never the whole site, which other apps share) and `id` stays `nap-log-v2`: changing it makes phones treat Nap Log as a new app |
| `icon-*.png` | App icons (background must stay `#1F2358`, the app colour, or Android shows a square on the launch screen) |
| `badge-96.png` | White moon shown as the small icon on notifications (Android draws it in one colour) |
| `sender/notify.mjs` | Sends the push notifications (run by GitHub Actions) |
| `.github/workflows/notify.yml` | Runs the sender every 5 minutes (GitHub often runs it much less often) |
| `tests/plan.test.mjs` | Tests for the plan maths |
| `tests/backup.test.mjs` | Tests for export/import: round-trips, refused files, old exports (made-up data only) |
| `tests/storage.test.mjs` | Tests for the localStorage key move (`nt_` to `nap-log.`) |
| `tests/sw.test.mjs` | Tests that the service worker only touches Nap Log's own caches and scope |
| `tools/backtest.mjs` | Replays a logged history through the plan maths and reports the prediction error |
| `tools/accuracy.mjs` | Reports the real-world accuracy of each app version from the saved predictions (`pred`) |
| `CLAUDE.md` | Working notes for Claude sessions on this repo |

## Statistics tab (v3)

Charts of the last 7, 14 or 30 full days (inline SVG, touch a chart for each day's values):
when she falls asleep (nap starts and bedtime), when she wakes up (morning and nap ends), how long naps last, night
sleep, and her day as stacked bars (night sleep, naps, awake). Per-day figures come from `dailyStats` in `plan.js`.
One scale per chart, so night sleep has its own chart. Colours were checked for colour-blind separation and contrast
on the dark background. In shared mode the days older than the 14-day live sync are fetched once (`ensureRecent`).

## How sharing works

There is no login. Both phones enter the same **family code** in Settings (the ⚙ at the top; the code is hidden until you tap Show), and the app syncs through
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
only known family codes are allowed (set 2026-10-22), and **listing the `families` collection is denied**, so nobody
can find a code. The rules live only in the Firebase console, never in this public repo, because they contain the real code:

```
function napOk(id) { return id in ['<family code>']; }
match /families/{family} {
  allow get, create, update: if napOk(family);
  match /{sub}/{doc=**} { allow read, write: if napOk(family); }
}
```

Anyone can open the app, but with any other code nothing syncs. **A new family code only works after it is added to the rules**
in the Firebase console (Firestore → Rules → Publish). The same rules also cover Home log, which shares the Firebase project.

Without a family code the app runs in local-only mode (data stays on that phone).

Live sync covers the last 14 days. Older months are loaded on demand in History.
Everything read from Firestore, local storage or an imported file is validated before use (`okE`, `okS` in `backup.js`),
because the page builds HTML from it.

## Push notifications

Turned on per phone from the bell (🔔) at the top, next to the ⚙ (since v3.12; it was a fold under the plan before).
The bell is lit, with a dot, while this phone has a working subscription.

1. The app works out the next nap or bedtime and writes "notify at T minus 30 min" into the family document.
2. The GitHub Action runs `sender/notify.mjs`, which reads that document and, when it is due, sends a web push
   (VAPID) to every saved subscription. Dead subscriptions are removed. Rejected subscriptions are also recorded in
   the family document (`deadSubs`); a phone that still holds one throws it away and subscribes again when the app opens.
3. Secrets live only in the repo's Actions secrets: `FAMILY_CODE` and `VAPID_PRIVATE_KEY`. The repo is public,
   so the sender only logs counts, never codes or times.

Timing: GitHub's own scheduler often runs the job only every few hours, so an external timer on cron-job.org starts
the workflow every 5 minutes through the workflow dispatch API (`POST .../actions/workflows/notify.yml/dispatches`
with body `{"ref":"main"}`), using a fine-grained GitHub token limited to this repo with Actions read/write. The token
lives only in cron-job.org. GitHub's schedule stays on as a backup; doubles are harmless because each notification is
sent once (`notifySent`) and runs never overlap (`concurrency`). If notifications stop, check the cron-job.org history
first: an expired token shows up there as HTTP 401.

On iPhone, push only works when the app is opened from its home-screen icon (iOS 16.4 or later).

## Export and import (v3.10)

In Settings (⚙): **Export data** downloads `nap-log-YYYY-MM-DD.json` with every entry (in shared mode the whole family
log, read from the server, not just the 14 synced days), the settings, today's added extra naps and the Statistics
range. It is built in the browser (Blob + download link), so the Content-Security-Policy needed no new address. It
**never contains the family code** or any other secret. Layout:

```
{format: 'nap-log-export', version: 1, app: '3.10', exportedAt: ms,
 settings: {targetNaps, bedtime}, extraNaps: {day, n} | null, prefs: {statsN, pushOff},
 entries: [{id, type, start, end, pred?}, ...]}
```

**Import data** checks the whole file first (`Backup.parseImport` in `backup.js`): the format name and version, every
entry through `okE` plus sane times (no duplicate ids, no end before start, nothing over a day long, no entry still
open from more than a day ago), and settings, extra naps and preferences if present. One bad value refuses the whole
file and nothing is written. Older or hand-made files may leave out `settings`, `extraNaps`, `prefs`, `app`,
`exportedAt`, `pred` and `end`. A preview shows how many entries and which dates, then:

- **Merge** (default): adds entries whose id is not in the log yet; existing entries and the settings stay as they are.
- **Replace**: the log becomes exactly the file (other entries are deleted) and the file's settings, extra naps and
  Statistics range are restored. Asks a second time, because it syncs to both phones.

Imported entries go through the normal sync path: Firestore batch writes under the current family code (or local
storage in local-only mode). `pushOff` is exported for completeness but never imported: notifications are per phone.
When the format changes, raise `Backup.VERSION` and keep reading the older versions.

## How the plan works

The full explanation is in the app under **How the plan works**. In short:

- **Next nap** = end of the previous sleep + her usual awake window before that nap (past 7 days,
  recent days weighted more: a day's weight halves every 4 days). Awake windows are kept between 30 min and 3h 30m.
- **Catch-up** after short naps stretches the remaining naps to at most 1.5× their usual length (and 3 h). If 15+ min are
  still missing, an **extra ("bridge") nap** of 30–45 min is suggested halfway between the last nap and the target bedtime,
  only with 75 min to 3h 30m awake on each side. Until it is added it is only a suggestion: the countdown and the
  notification go to bedtime, planned without it (usually earlier); once added, bedtime aims for its target.
- With more naps planned than her data has (an added or borrowed nap), the time until bedtime is shared evenly over the
  remaining awake windows, each at most its usual length, so all remaining naps move earlier.
- A suggested extra nap shows as a pulsing dashed bubble with a + on the ring and an "Extra nap? ＋ Add" row; tapping
  either adds it. The ring then animates from the old plan to the new one (`animatePlan`); the same happens after editing
  or deleting an entry (`markAnim` before the change, the animation runs on the next render).
- **＋ Add extra nap** adds a nap to today's plan without times (family document field `extraNaps: {day, n}`, today
  only); the plan re-times the remaining naps. **＋ Log a nap** enters real times.
- A nap number with **no data** in the past 7 days is planned like a bridge nap: at most 45 min (or the last nap
  number's usual length), halfway between the previous nap and bedtime.
- **Nap in progress** gets a target length. Before the day's last nap: her usual length for that nap. The last nap: today's
  nap-time target − naps already done today (at least 20 min), but long enough that the stretch to the target bedtime is
  at most her usual gap before bed + 35 min (capped at 1.5× its usual length). Checked 10 min into every logged nap (v3.3):
  nap-length error went from 46 to 30 min (the budget overestimated earlier naps), the last nap stayed at ~24 min. Shown as "target +x min" / "past target by x min". The plan assumes
  she wakes at the target; past it, everything is planned from now. A nap beyond the target number of naps (added, or without data)
  is a bridge nap: target at most 45 min (her past extra naps: 23–66 min, typically ~37). After an added nap, bedtime
  aims for its target (no lean towards a later bedtime).
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

## Security

- No secrets in the code (the repo is public): the Firebase web key is public by design and the Firestore rules decide who may read or write. The family code and the VAPID private key live only on the phones and in Actions secrets.
- Synced and imported data is validated (`okE`, `okS`, `Backup.parseImport`) and escaped (`esc`) before it is shown.
- Export files hold personal data. They never contain the family code, and they must never be committed (`nap-log-*.json` is in `.gitignore`).
- `index.html` sets a Content-Security-Policy: scripts only from this site and the pinned Firebase SDK on gstatic.com, styles and fonts also from Google Fonts, and data may only be sent to this site and Firestore (`firestore.googleapis.com`, plus Google's connectivity pixel that Firestore uses). Inline scripts are still allowed, because the app's code and its `onclick` handlers live inside `index.html`; the planned readability refactor can move them into files and drop that.
- The push sender sends `Referer: https://germani144.github.io/nap-log/` with every Firestore request, so the web key can be restricted to the app's address in Google Cloud without breaking notifications.

## Tests and backtest

```
TZ=Europe/Copenhagen node --test tests/*.test.mjs
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
  with each prediction) and the cache name in `sw.js` (`nap-log-v3.12`; keep the `nap-log-` prefix), or phones keep showing the old version.
- **Check for updates** (in Settings, the ⚙ at the top) fetches `sw.js` from the server with `cache: 'no-store'`, reads the version from its
  cache name and compares it with `VER`. If the server has a newer one, it updates the service worker, deletes only Nap
  Log's own caches and reloads. It also shows whether GitHub Pages is really serving the latest push. After pushing, check
  `https://germani144.github.io/nap-log/sw.js` shows the new version; if not, push again to re-trigger the build.
- localStorage is shared with the other apps on this origin: every key here starts with `nap-log.` (use `load`/`save`, or `lsGet`/`lsSet`/`lsDel`). Older versions used `nt_`; those keys are moved over once on first launch, so nobody loses their family code or entries.
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
- Once today's target naps (plus any added extra naps) are logged, **Start night** becomes the filled main button and
  **Start nap** the outlined one. They keep their places; only the styles swap.
- The middle of the ring shows the countdown to the next nap or bedtime, its expected time ("at ~10:29") and the
  awake time underneath.
