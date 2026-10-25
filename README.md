# Nap Log

A small web app for tracking a baby's naps and night sleep, shared between two phones.
It suggests today's naps and bedtime from the past week and can send a push notification
about 30 minutes before the next nap or bedtime.

Live at **https://germani144.github.io/nap-log/**. Open it in Chrome (Android) or Safari (iPhone) and add it to the home screen. Chrome on Android installs only one app per address, so Nap Log is the only installable app on `germani144.github.io`; Pedro's other apps have their own addresses.

# How it works

## Files

There is no build step: GitHub Pages serves the files as they are, and the app loads nothing from npm.

| File                           | What it does                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                   | The page: markup only (tabs, dialogs, the "How the plan works" text `#algo`), then the scripts in order. No inline code                                                           |
| `styles.css`                   | All styles. Colours are custom properties at the top; the app is dark only                                                                                                        |
| `plan.js`                      | The plan maths: averages, today's suggested naps and bedtime (`makePlan`), saved predictions (`predBefore`), per-day statistics (`dailyStats`). Pure: no screen, storage or clock |
| `backup.js`                    | Export/import file format and checks (`Backup`), and the validators `isValidEntry` (entries) and `cleanSettings` (settings). Pure                                                 |
| `js/core.js`                   | Small pure helpers the app files share: `escapeHtml`, `tapAction`, typed times, the extra-nap count, `reminderUpdate`, the update-check version reader                            |
| `js/*.js`                      | The app, one file per area (table below)                                                                                                                                          |
| `sw.js`                        | Service worker: newest files first, an offline copy, push notifications (details under [Offline and updates](#offline-and-updates))                                               |
| `manifest.json`                | Install info. `start_url` and `scope` are `./` (only `/nap-log/`) and `id` stays `nap-log-v2`: changing it makes phones treat Nap Log as a new app                                |
| `icon-*.png`, `badge-96.png`   | App icons (background must stay `#1F2358`, or Android shows a square on the launch screen) and the white moon on notifications                                                    |
| `sender/notify.mjs`            | Sends the push notifications (run by GitHub Actions)                                                                                                                              |
| `.github/workflows/notify.yml` | Runs the sender every 5 minutes (GitHub often runs it much less often; see [Push reminders](#push-reminders))                                                                     |
| `tests/`                       | Unit tests (`*.test.mjs`) and browser tests (`browser/`); see [Tests](#tests)                                                                                                     |
| `tools/`                       | `backtest.mjs` replays a logged history through the plan; `accuracy.mjs` reports the saved predictions' real-world error                                                          |
| `package.json`                 | Dev tools only: Playwright (browser tests) and Prettier (formatting)                                                                                                              |
| `CLAUDE.md`                    | Working rules for Claude sessions on this repo                                                                                                                                    |

The app files are classic scripts that share one global scope, loaded in this order (each may use what comes before;
code that runs at load only touches earlier files):

| `js/` file       | What it holds                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.js`        | The pure helpers above                                                                                                                                         |
| `config.js`      | Firebase web config, `VER` (the app version) and the public push key                                                                                           |
| `storage.js`     | localStorage under `nap-log.` (`load`, `save`, `lsGet`, `lsSet`, `lsDel`) and the one-time move from old `nt_` keys                                            |
| `state.js`       | The app state: `settings`, `entries` (the live 14 days), `olderEntries`, `familyCode`, `db`, `familyDoc`, the History month and day, `allEntries`, `findEntry` |
| `sync.js`        | `saveEntry` / `deleteEntry` (Firestore or this phone), `connectSync` (live listeners)                                                                          |
| `entries.js`     | Start / end a nap or night (`startSleep`, `endSleep`, with the saved prediction), extra naps (`setExtraNaps`, `extraNapsToday`)                                |
| `ring.js`        | SVG drawing helpers for the day ring and `planRow` for the plan list                                                                                           |
| `today.js`       | `render()`: the Today tab (ring, countdown, buttons, plan), the plan animation, then History and Statistics                                                    |
| `edit-dialog.js` | The edit box for a nap or night: `openEdit`, `openAdd`, `logWake`, Save and Delete                                                                             |
| `notify.js`      | The reminder written for the sender (`syncReminder`), push subscriptions and the bell box                                                                      |
| `stats.js`       | The Statistics tab (line and bar charts, touch tooltips)                                                                                                       |
| `tabs.js`        | Switching tabs by tapping or swiping                                                                                                                           |
| `history.js`     | The History tab: month calendar and the selected day; loads older months on demand                                                                             |
| `settings.js`    | The Settings box (targets, family code hidden until Show)                                                                                                      |
| `backup-ui.js`   | Export data / Import data in Settings                                                                                                                          |
| `main.js`        | Startup: the tap-action table (`ACTIONS`), the service worker, Check for updates, the first render                                                             |

**Taps:** HTML that the app builds (plan rows, the ring, calendar days, buttons) carries `data-act="…"` attributes made
by `tapAction()`; one click listener in `main.js` looks the action up in `ACTIONS`. There is no `onclick` code anywhere,
which is what lets the Content-Security-Policy forbid inline scripts.

## Data

**An entry** (a nap or a night): `{id, type: 'nap' | 'night', start, end, pred}`. Times are milliseconds; `end` is
`null` while she sleeps. `pred` (every new or re-timed entry since v2.15, whether started with a button or filled in
later) is what the app would have predicted just before it started, from the history logged before it:
`{s: predicted start, len: predicted length in minutes, n: nap number, v: app version}`. It is used to measure
real-world accuracy (`tools/accuracy.mjs`).

**The family document** `families/{code}`: `settings` (`targetNaps`, `bedtime`), `extraNaps: {day, n}` (extra naps
added to today's plan, today only), the next reminder (`notifyAt`, `notifyEvent`, `notifyKey`, `notifyLabel`,
`notifyTime`, `notifyText`, `notifySent`) and `deadSubs` (subscriptions the push service rejected).

**This phone** (localStorage, shared with any other app on the address, so every key starts with `nap-log.`):
`settings`, `entries` (a copy of the live entries, or all of them in local-only mode), `family` (the family code),
`extra` (extra naps in local-only mode), `pushoff` (notifications turned off on this phone) and `statsN` (the
Statistics range). Older builds used `nt_` keys; they are moved over once at startup.

**Export file**: see [Export and import](#export-and-import).

## Sync

There is no login. Both phones enter the same **family code** in Settings (the ⚙ at the top; the code is hidden until
you tap Show), and the app syncs through Firebase Firestore (free plan): the family document above, entries under
`families/{code}/entries/{id}` and push subscriptions under `families/{code}/subs/{id}`, one per phone.

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

Live sync (`connectSync`) covers the last 14 days: all the plan and its 7-day averages need. History loads older months
on demand (`loadShownMonth`), Statistics the rest of the last 30 days once (`loadLast30Days`), and Export reads the whole
log from the server. Everything read from Firestore, local storage or an imported file is validated before use
(`isValidEntry`, `cleanSettings`), because the page builds HTML from it, and escaped (`escapeHtml`) when shown.

Note: saving Settings writes this phone's targets to the family document, so a phone that joins a family with its own
settings changes the family's targets.

## The plan

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
  or deleting an entry (`animateNextRender` before the change, the animation runs on the next render).
- **＋ Add extra nap** adds a nap to today's plan without times (family document field `extraNaps: {day, n}`, today
  only); the plan re-times the remaining naps. **＋ Log a nap** enters real times.
- A nap number with **no data** in the past 7 days is planned like a bridge nap: at most 45 min (or the last nap
  number's usual length), halfway between the previous nap and bedtime.
- **Nap in progress** gets a target length. Before the day's last nap: her usual length for that nap. The last nap: today's
  nap-time target − naps already done today (at least 20 min), but long enough that the stretch to the target bedtime is
  at most her usual gap before bed + 35 min (capped at 1.5× its usual length). Checked 10 min into every logged nap (v3.3):
  nap-length error went from 46 to 30 min (the budget overestimated earlier naps), the last nap stayed at ~24 min. Shown as
  "target +x min" / "past target by x min". The plan assumes she wakes at the target; past it, everything is planned from
  now. A nap beyond the target number of naps (added, or without data) is a bridge nap: target at most 45 min (her past
  extra naps: 23–66 min, typically ~37). After an added nap, bedtime aims for its target (no lean towards a later bedtime).
- **Nap length** = the usual length of that nap, lengthened if earlier naps were short so the day reaches the
  usual total nap time (a nap is never stretched beyond 3 hours).
- **Bedtime** = the target bedtime, allowed to move 30 min either way to respect the awake limits, leaning about a
  third towards "end of last nap + usual gap before bedtime".
- **Wake-up** = this morning's logged wake-up, or the average of the past 7 mornings (shown with ~). An estimated
  wake-up can be tapped (`logWake`): it edits last night's entry if there is one, otherwise it logs last night.
- **Night ring** = expected night length is the average of the nights in the past 8 days.

`makePlan(entries, now, settings)` only uses its inputs, so tests and the backtest can feed it any history and any
"now"; the app only draws what it returns. The keys it returns are short (`B` bedtime, `bt` target bedtime, `tn`
today's naps, `wk0` wake-up, `we` this morning's night, `bn` tonight's bedtime, `cur` the nap in progress, `rows` the
plan rows, `want` the reminder, …; the comment above the return in `plan.js` lists them) and are kept as they are,
because the tools and the saved predictions rely on them.

These choices were backtested on the logged history (46 days, predicting each day from the days before it):
next-nap error went from about 45 to 16 minutes, bedtime from about 25 to 20 minutes (`tools/backtest.mjs`).
The 1.5× catch-up cap and the extra nap (v2.16) brought the next nap to about 15.2 and bedtime to about 19.7 minutes.
The target for the nap in progress (v2.11) was checked the same way 30 minutes into each nap: bedtime predicted during
the last nap went from about 25 to 22 minutes off, the next nap from about 27.7 to 28.4 minutes (a small cost).

## The screens

- **Today**: the ring is the day from wake-up (sun) to bedtime (moon), drawn as inline SVG in `render()` (`js/today.js`,
  helpers in `js/ring.js`). A nap bar is a capsule only when at least 30px long, and gets the 💤 at full size from 38px
  long; shorter naps (and dots) get a smaller 💤 that fits inside them. Suggested naps get their expected start and end
  times written along the ring; a label is skipped when it would collide with another label or the sun/moon discs, and
  nap times take priority over the current-time label. A nap in progress is a dotted outline up to its target end,
  filling up as she sleeps. The middle shows the countdown to the next nap or bedtime, its expected time ("at ~10:29")
  and the awake time underneath. Logged naps, the sun and the moon open the same edit box as their plan rows.
- Once today's target naps (plus any added extra naps) are logged, **Start night** becomes the filled main button and
  **Start nap** the outlined one. They keep their places; only the styles swap.
- **The edit box** opens without focusing a time field, so the keyboard only appears when a time is tapped. Times are
  typed on the numeric keypad ("1437" → 14:37, "730" → 07:30, `parseTypedTime`). A night's fields are Bedtime and Wake-up.
- **History**: a month calendar (each bar is that day's nap total) and the selected day's wake-up, naps and bedtime.
- **Statistics** (v3): charts of the last 7, 14 or 30 full days (touch a chart for each day's values): when she falls
  asleep, when she wakes up, how long naps last, night sleep, and her day as stacked bars. Per-day figures come from
  `dailyStats` in `plan.js`. One scale per chart, so night sleep has its own chart. Colours were checked for
  colour-blind separation and contrast on the dark background.
- Swipe left or right to change tab.

## Push reminders

Turned on per phone from the bell (🔔) at the top, next to the ⚙ (since v3.12). The bell is amber while this phone has a
working subscription and grey otherwise.

1. The app works out the next nap or bedtime and writes "notify at T minus 30 min" into the family document
   (`syncReminder`, which asks `reminderUpdate` in `js/core.js` what to write: plan it, move it, cancel it or leave it).
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

## Export and import

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
entry through `isValidEntry` plus sane times (no duplicate ids, no end before start, nothing over a day long, no entry still
open from more than a day ago), and settings, extra naps and preferences if present. One bad value refuses the whole
file and nothing is written. Older or hand-made files may leave out `settings`, `extraNaps`, `prefs`, `app`,
`exportedAt`, `pred` and `end`. A preview shows how many entries and which dates, then:

- **Merge** (default): adds entries whose id is not in the log yet; existing entries and the settings stay as they are.
- **Replace**: the log becomes exactly the file (other entries are deleted) and the file's settings, extra naps and
  Statistics range are restored. Asks a second time, because it syncs to both phones.

Imported entries go through the normal sync path: Firestore batch writes under the current family code (or local
storage in local-only mode). `pushOff` is exported for completeness but never imported: notifications are per phone.
When the format changes, raise `Backup.VERSION` and keep reading the older versions.

## Offline and updates

`sw.js` fetches every file network-first with `{cache: 'no-cache'}` (so the files never come from different versions),
keeps a copy of the app's files (`APP_FILES`) for offline use and shows push notifications. It only touches caches named
`nap-log-…` (plus its old `nap-v…` ones), reads only from its own cache, only stores successful responses, only handles
requests inside `/nap-log/`, and a notification tap only focuses a Nap Log tab.

**Check for updates** (in Settings) fetches `sw.js` with `cache: 'no-store'`, reads the version from its cache name
(`versionInSw`) and compares it with `VER`. If the server has a newer one, it updates the service worker, deletes only
Nap Log's own caches and reloads. It also shows whether GitHub Pages is really serving the latest push: after pushing,
check `https://germani144.github.io/nap-log/sw.js` shows the new version; if not, push again to re-trigger the build.
Phones on older versions read that version with the regex `C=P\+'v([\d.]+)'`, so the cache-name line in `sw.js` keeps
exactly the shape `const P='nap-log-',C=P+'v3.16';` (it is marked `prettier-ignore`, and `tests/version.test.mjs`
checks it).

## Security

- No secrets in the code (the repo is public): the Firebase web key is public by design and the Firestore rules decide who may read or write. The family code and the VAPID private key live only on the phones and in Actions secrets.
- Synced and imported data is validated (`isValidEntry`, `cleanSettings`, `Backup.parseImport`) and escaped (`escapeHtml`) before it is shown.
- Export files hold personal data. They never contain the family code, and they must never be committed (`nap-log-*.json` is in `.gitignore`).
- `index.html` sets a Content-Security-Policy: scripts only from this site and the pinned Firebase SDK on gstatic.com, styles and fonts also from Google Fonts, and data may only be sent to this site and Firestore (`firestore.googleapis.com`, plus Google's connectivity pixel that Firestore uses). No inline scripts are allowed (no `'unsafe-inline'` in `script-src`): all code is in files, and taps use `data-act` attributes instead of `onclick` code. Inline styles are still allowed (`style-src 'unsafe-inline'`), for the few computed positions and colours.
- The push sender sends `Referer: https://germani144.github.io/nap-log/` with every Firestore request, so the web key can be restricted to the app's address in Google Cloud without breaking notifications.

## Tests

```
TZ=Europe/Copenhagen node --test tests/*.test.mjs      # unit tests (no install needed), or: npm test
npm install                                             # once, for the browser tests and Prettier
npx playwright install chromium                         # once, if Chromium is not installed yet
npm run test:browser                                    # browser tests
npm run format                                          # Prettier (npm run format:check only checks)
TZ=Europe/Copenhagen node tools/backtest.mjs history.json
TZ=Europe/Copenhagen node tools/accuracy.mjs history.json
```

**Unit tests** (`tests/*.test.mjs`, Node's built-in runner):

| File                    | What it checks                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `plan.test.mjs`         | The plan maths: awake windows, catch-up, extra naps, bedtime limits, predictions, daily statistics   |
| `backup.test.mjs`       | Export/import: round-trips, refused files, old exports with missing fields, Merge and Replace        |
| `core.test.mjs`         | The shared helpers: escaping, tap actions, typed times, extra naps, when the reminder is (re)planned |
| `storage.test.mjs`      | localStorage keys under `nap-log.` and the one-time move from `nt_`, run on `js/storage.js` itself   |
| `sw.test.mjs`           | The service worker only touches its own caches and scope, and saves every file `index.html` loads    |
| `clock-change.test.mjs` | The days the clocks change: reminders, saved predictions and "the past 7 days" still use clock time  |
| `version.test.mjs`      | `VER` matches the `sw.js` cache name, in the shape older versions read                               |

**Browser tests** (`tests/browser/`): the real app in mobile-emulated Chromium (Pixel 7, one iPhone check) with a fixed
clock and no network. The Firebase SDK is replaced by `fake-firebase.js`, a small fake Firestore whose data the test
runner keeps (`harness.mjs`), so two "phones" share one family log. They cover logging naps and nights with the buttons
and by hand, editing and deleting (typed times, refusals), the plan screen, extra naps, an unlogged wake-up, settings,
sharing between two phones (naps, extra naps, settings, the reminder), History loading older months, Statistics,
export → import (Merge, Replace with its second confirmation, a broken file), the bell, tab swipes, offline use and
Check for updates. Every test also fails on any console error or Content-Security-Policy violation.

All test data is made up. The backtest and accuracy tools need an export of the logged entries; it holds personal
data, so keep it out of the repo (`history*.json` and `nap-log-*.json` are ignored). Run the backtest before and after
changing the plan logic. It replays history with today's code and settings; `accuracy.mjs` instead uses the
predictions saved with each entry, so it also reflects old settings and versions, and shows how often naps start before
or after the suggestion (a hint of how much the suggestions steer you).

# Changing the code

- **Releases:** every release gets a version `vMAJOR.MINOR` (minor +1 per release, major for big redesigns), set in two
  places: `VER` in `js/config.js` (shown next to the title and saved with each prediction) and the cache name in `sw.js`
  (`nap-log-v3.16`), or phones keep showing the old version. Run all tests, then push to main.
- **Clock changes:** a day is not always 24 hours (23 in March, 25 in October). Go from a day to the next with
  `addDays`, and from a plan time (minutes of the day) to a moment with `timeAtMinute` (both in `plan.js`); never add
  `DAY` or `minutes × 60000` to a midnight. `tests/clock-change.test.mjs` covers both clock changes (fixed in v3.16:
  a typed wake-up after the October night was saved an hour early, and that day's reminders came an hour early).
- **Plan logic** goes in `plan.js` with a test; screen code in `js/`; small pure helpers in `js/core.js` with a test.
- **A new tap action:** add it to `ACTIONS` in `js/main.js` and put `tapAction('name', { … })` on the element. Never
  `onclick=` (the CSP blocks it, and the browser tests fail on it).
- **A new file:** add its `<script>` to `index.html` in the right place and its path to `APP_FILES` in `sw.js`
  (`tests/sw.test.mjs` checks this).
- **localStorage** is shared with any other app on this address: every key starts with `nap-log.` (use `load`/`save`,
  or `lsGet`/`lsSet`/`lsDel`).
- **Firestore REST** (`sender/`): in `commit` writes the document `name` must contain the family code **raw**, not
  URL-encoded (the code has spaces). In URL paths it must be encoded.
- **Formatting:** Prettier (`npm run format`), except the `prettier-ignore` cache-name line in `sw.js`.
