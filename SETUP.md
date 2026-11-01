# Set up your own Nap Log

Nap Log is a small app for a baby's naps and nights: it suggests today's naps and bedtime from the past week, can be
shared between two phones and can send a reminder about 30 minutes before the next nap or bedtime. This guide sets
up your **own copy**: your own address, your own data, nothing shared with anyone else. It costs nothing.

**If you are a parent:** give this page to Claude, for example: _"Help me set up Nap Log by following
https://github.com/Germani144/nap-log/blob/main/SETUP.md"_. Claude will walk you through it one step at a time.

---

## For Claude: how to guide the parent

You are helping a parent, probably not technical, set up their own copy of Nap Log on a phone.

- **Go one step at a time.** Say what to tap, in plain words, and wait for them to say it worked before the next
  step. Ask what phone they have (Android or iPhone) and use the matching instructions.
- **Start with Level 1.** Offer Level 2 (sharing with a partner) and Level 3 (reminders) after it works; both are
  optional. Level 3 needs Level 2.
- **You write the files, they paste them.** The only file a copy ever changes is `js/config.js`. Give them the
  complete new file in one code block and tell them how to paste it in GitHub's editor (below). If you have access to
  their GitHub repository (for example in Claude Code), you may make the commit yourself instead.
- **Things only they can do:** create accounts, click in GitHub and Firebase, paste secrets. Never ask for their
  passwords.
- **Privacy:** the copy lives in a **public** repository. Never put the family code, the private push key or anything
  about their baby (names, nap times, exports) into a file in the repository. The family code goes only into the
  Firebase rules and the app's Settings; the private push key only into a GitHub secret.
- **Do not change anything else:** not the app code, not `manifest.json` (its `id` must stay `nap-log-v2`). If a step
  fails, explain what you see and suggest the fix from "If something goes wrong" below; do not improvise.
- In the steps below, `USERNAME` is their GitHub username in **lower case**, and `ADDRESS` is
  `https://USERNAME.github.io/nap-log/`.

### How to paste a new `js/config.js` (GitHub website, works on a phone too)

1. In their copy on github.com, open the folder `js`, then the file `config.js`.
2. Tap the pencil icon (**Edit this file**). On a phone the pencil may be in the **⋯** menu.
3. Select everything in the editor and delete it, then paste the new file from Claude.
4. Tap **Commit changes…**, then **Commit changes** again.
5. The app updates by itself within a minute or two.

---

## Level 1: the app on your phone (about 15 minutes)

The app works fully on one phone. Data stays on that phone.

1. **GitHub account** _(parent)_. Go to https://github.com/signup and create a free account. The username becomes
   part of the app's address, so pick something you are happy to see in it. Confirm the e-mail address.
2. **Copy the app** _(parent)_. Open https://github.com/Germani144/nap-log and tap **Fork**, keep the name `nap-log`,
   and tap **Create fork**. A fork keeps a **Sync fork** button for getting updates later.
3. **Publish it** _(parent)_. In the copy: **Settings → Pages**. Under "Build and deployment", Source: **Deploy from a
   branch**, Branch: **main** and **/ (root)**, then **Save**. After a minute or two the page shows "Your site is
   live at `ADDRESS`".
4. **Its own settings** _(Claude writes, parent pastes)_. Give them this `js/config.js`, with their address:

   ```js
   // Nap Log settings for this copy of the app. In a copy (a fork), this is the only file to change: see SETUP.md.

   // The address of this copy (GitHub: Settings > Pages).
   const APP_ADDRESS = 'https://USERNAME.github.io/nap-log/';

   // Sharing between phones: the web config of this copy's Firebase project, or null for no sharing.
   const FIREBASE_CONFIG = null;

   // Reminders: the public push key, or null for no reminders.
   const VAPID_PUBLIC = null;
   ```

5. **Install it on the phone** _(parent)_. Open `ADDRESS` on the phone.
   - **Android (Chrome):** tap **⋮ → Add to home screen** (or **Install app**), then **Install**.
   - **iPhone (Safari):** tap the **Share** button → **Add to Home Screen** → **Add**.

   From now on, open Nap Log from the new icon.

6. **First use** _(parent)_. Tap the **⚙** at the top: set the target number of naps a day and the usual bedtime,
   then **Save**. Use **Start nap**, **End nap**, **Start night** and **Wake up** as the day goes. The suggestions get
   good after about a week of logging. Tap any row to fix a time. **How the plan works** (at the bottom of the Today
   tab) explains everything.

It worked if the chip at the top says **local only** and the app opens from the icon.

---

## Level 2: share with your partner (optional, about 15 minutes)

Both phones see the same log, live. This uses a free Firebase project (Google), which belongs to the parent.

1. **Family code** _(Claude)_. Make a long random code of five or six random words, for example
   `maple-river-otter-candle-seven-kite` (make a new one; do not use this example). Tell the parent: this code is
   like a password for the log, keep it in a note or password manager, and never post it.
2. **Firebase project** _(parent)_. Go to https://console.firebase.google.com and sign in with a Google account. Tap
   **Create a project**, name it for example `nap-log-family`, switch **Google Analytics off**, and create it.
3. **Database** _(parent)_. In the project: **Build → Firestore Database → Create database**. Pick a location near
   them (in Europe, for example `eur3`), then **Start in production mode** → **Create**.
4. **Rules** _(Claude writes, parent pastes)_. In Firestore Database, open the **Rules** tab, replace everything with
   this (with their family code), and tap **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function napOk(id) { return id in ['THEIR FAMILY CODE']; }
       match /families/{family} {
         allow get, create, update: if napOk(family);
         match /{sub}/{doc=**} { allow read, write: if napOk(family); }
       }
     }
   }
   ```

   Only this code can read or write; nobody can list the families, so nobody can find the code.

5. **Web config** _(parent)_. Tap the **⚙ next to "Project Overview" → Project settings**. Under "Your apps", tap the
   **web icon `</>`**, give it a nickname (for example `nap-log`), leave "Firebase Hosting" off, and tap **Register
   app**. Firebase shows a block starting with `const firebaseConfig = {`. Copy that block and send it to Claude.
   (It is not secret: it only says which project to use; the rules above decide who may use it.)
6. **Settings** _(Claude writes, parent pastes)_. A new `js/config.js` with the same `APP_ADDRESS`, `FIREBASE_CONFIG`
   set to their config, and `VAPID_PUBLIC = null`:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: '…',
     authDomain: '…',
     projectId: '…',
     storageBucket: '…',
     messagingSenderId: '…',
     appId: '…',
   };
   ```

7. **Both phones** _(parent)_. Install the app on the partner's phone too (Level 1, step 5). On each phone: **⚙ →
   Family code**, type the same code, **Save**. The chip at the top now says **shared**. A nap started on one phone
   shows on the other within seconds.

Anything logged before the code was entered stays on that phone. To bring it over: on that phone **⚙ → Export data**,
then after entering the code **⚙ → Import data** with that file and choose **Merge**.

---

## Level 3: reminders (optional, needs Level 2, about 15 minutes)

A notification about 30 minutes before the next nap or bedtime, on every phone that switches it on. A small job in
their GitHub copy sends them.

1. **Push keys** _(Claude)_. Generate a key pair by running this Python (it needs the `cryptography` package):

   ```python
   import base64
   from cryptography.hazmat.primitives import serialization
   from cryptography.hazmat.primitives.asymmetric import ec

   key = ec.generate_private_key(ec.SECP256R1())
   b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
   public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
   private = key.private_numbers().private_value.to_bytes(32, "big")
   print("VAPID_PUBLIC (goes in js/config.js):", b64(public))
   print("VAPID_PRIVATE_KEY (goes ONLY in the GitHub secret):", b64(private))
   ```

   (Or with Node: `npx web-push generate-vapid-keys`.) If you cannot run code, say so; the parent can run the Node
   command on a computer. The public key is 87 characters, the private key 43.

2. **Settings** _(Claude writes, parent pastes)_. A new `js/config.js`: as in Level 2, with
   `VAPID_PUBLIC = 'the public key';`.
3. **Two secrets** _(parent)_. In their copy on GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**, twice:
   - Name `FAMILY_CODE`, value: their family code.
   - Name `VAPID_PRIVATE_KEY`, value: the private key.
4. **Switch the job on** _(parent)_. Open the **Actions** tab. GitHub switches jobs off in copies: tap **I understand
   my workflows, go ahead and enable them**. Then tap **Nap notifications** on the left, **Enable workflow** if shown,
   and **Run workflow → Run workflow**. After a minute the run shows a green tick. Inside it, the message should say
   something like "No family document yet", "Nothing scheduled" or "Not due yet". That means it works.
5. **On each phone** _(parent)_. Tap the **bell** at the top → **Enable push notifications** → **Allow**. The bell
   turns amber. **Send test** sends a test; it arrives within about 5–10 minutes (sometimes later). On an iPhone
   this only works when Nap Log is opened from its home-screen icon (iOS 16.4 or later).

**Timing.** GitHub runs the job about every 5 minutes on paper, but in practice often much less often, so reminders
can come late or not at all. If they want reliable reminders, offer the free timer (about 10 more minutes):

1. GitHub → their picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**. Repository access: **Only select repositories → nap-log**. Permissions: **Actions: Read and
   write**. Expiration: the longest offered (put a reminder in the calendar to renew it). Copy the token.
2. https://cron-job.org → free account → **Create cronjob**: URL
   `https://api.github.com/repos/USERNAME/nap-log/actions/workflows/notify.yml/dispatches`, every 5 minutes. Under
   **Advanced**: request method **POST**, request body `{"ref":"main"}`, headers `Accept: application/vnd.github+json`
   and `Authorization: Bearer THE TOKEN`. Save.
3. The token is like a password for running that job: it stays only in cron-job.org.

GitHub also switches scheduled jobs off after 60 days without changes to the copy. Syncing updates (below) counts as
a change; otherwise switch it on again in the **Actions** tab.

---

## Getting updates

When the original Nap Log improves: open their copy on github.com and tap **Sync fork → Update branch**. Their
`js/config.js` is not touched by updates. The phones pick up the new version by themselves the next time the app is
opened (the version number next to the title changes).

## If something goes wrong

- **The address shows "404"**: Pages takes a few minutes after step 3, and after each change. Check **Settings →
  Pages** says the site is live, and that the address is all lower case.
- **The chip says "local only" although a family code is set**: `APP_ADDRESS` in `js/config.js` must be exactly the
  address in **Settings → Pages** (with `https://` and the `/` at the end), and `FIREBASE_CONFIG` must be filled in.
- **"shared" but the phones do not see each other**: both must have exactly the same family code, and the same code
  must be in the Firebase rules (then **Publish**).
- **The bell says "Reminders are not set up in this copy of Nap Log"**: `VAPID_PUBLIC` is missing in `js/config.js`,
  or `APP_ADDRESS` does not match.
- **No reminders**: open the **Actions** tab: are runs happening, and what does the latest one say? Check the two
  secret names are exactly `FAMILY_CODE` and `VAPID_PRIVATE_KEY`, that the bell is amber on the phone, and that
  the phone allows notifications for the app.
- **"This app is already installed" on Android**: another app is installed from the same address. Each app needs its
  own address.
