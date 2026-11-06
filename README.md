# Desk Lamp

A student community and support platform. It started as the single-file `legacy/study-hub_10.html`. This is **Milestone 1: a secure foundation** with real authentication, roles and deny-by-default database rules. Chat, discussion, to-dos, Pomodoro, the streak heatmap and themes are kept and rebuilt on a safe data model.

See [docs/AUDIT.md](docs/AUDIT.md) for the audit of the legacy app and the full milestone plan.

## What's in Milestone 1

| Area | Status |
|---|---|
| Firebase Auth (email + password) | Sign up, sign in, sign out, password reset, email verification (with resend), "keep me signed in" (local vs session persistence) |
| Profiles | Private `users/{uid}` (roll number: owner and admins only). Public `publicProfiles/{uid}` (display name). One account per roll number, enforced by rules. |
| Roles | `student` (default), `senior`, `counselor`, `moderator`, `admin`, stored in `/roles/{uid}`. **Only admins can write roles; enforced by rules.** The browser uses the role only to show a badge. |
| Restrictions | `moderation/suspended/{uid}` blocks posting and voting. `moderation/muted/{uid}` blocks posting. Both are enforced by rules. Moderators can't restrict moderators or admins. |
| Chat / Discussion | One record per message or post, one key per vote, server timestamps, realtime listeners instead of polling, bounded queries. Rules make records immutable; only the author or a moderator can delete. Email verification is required. |
| To-dos / streak | Private to the owner (admins can't read them either). Streak increments use a transaction. The heatmap uses the **local** day (fixes the legacy IST off-by-one). The timer runs on wall-clock time (fixes drift in background tabs). |
| Security hardening | No `innerHTML` with user data (fixes the legacy XSS). CSP and security headers on Hosting. No passwords stored by the app. No silent local-storage fallback. |
| Not yet built | Admin dashboard, reports, audit log, anonymous counselling, senior portal, academic spaces, weekly goals, ML. See the plan in `docs/AUDIT.md`. |

## Project layout

```
index.html              App shell (screens and tabs, no inline scripts or styles)
src/main.js             Boot and routing on auth state; mounts/unmounts features
src/firebase.js         Firebase init from env vars; emulator wiring
src/auth.js             Sign up/in/out, reset, verification, profile creation
src/lib/                Pure helpers: validation, errors, dates, timer, dom, config
src/features/           chat, discuss, todo, pomodoro (+ streak), theme, shared feed logic
src/styles.css          All styling, theme tokens
database.rules.json     Realtime Database security rules (the real enforcement)
firebase.json           Rules, Hosting (+ CSP headers), emulator ports
tests/unit/             Vitest unit tests (no emulator needed)
tests/rules/            Security-rules tests against the Database emulator
legacy/                 Original single-file app, for reference only
docs/AUDIT.md           Audit, security findings, migration plan
```

## Requirements

* Node.js 20 or newer
* Java 11 or newer (only for the Firebase emulators and `npm run test:rules`)
* A Firebase project (the free Spark plan is enough for Milestone 1)

## Local development (no Firebase project needed)

```bash
npm install
```

```bash
copy .env.example .env.local
```

Set `VITE_USE_EMULATORS=true` in `.env.local`. Then, in two terminals:

```bash
npm run dev:emulators
```

```bash
npm run dev
```

Open http://localhost:5173. The emulator UI at http://localhost:4000 shows users and data. In the Auth emulator, verification emails aren't sent. The link is printed in the emulator terminal; open it to verify. To make someone an admin locally, edit `roles/<uid>` to `"admin"` in the Database tab of the emulator UI.

Emulator test account used during development: `asha@college.test` / `emulator-pass-1` (roll `21CS001`). It exists only in the local Auth emulator, and emulator data is cleared every time the emulators restart.

## Tests

```bash
npm run test:unit
```

```bash
npm run test:rules
```

`npm test` runs both. The rules tests start a Database emulator with `database.rules.json`, then check authentication, authorization, impersonation, privacy, moderation, validation and the "can't wipe the chat" cases.

## Firebase setup (real project)

1. **Create or choose a project** at https://console.firebase.google.com. You can reuse `desk-lamp-974c1`, but read *Migrating from the legacy app* first.
2. **Authentication → Sign-in method:** enable **Email/Password**.
3. **Authentication → Settings:**
   * Turn on **Email enumeration protection**.
   * Under **Password policy**, require at least 8 characters to match the app.
   * Under **Authorized domains**, keep only your real domains (plus `localhost` for development).
4. **Realtime Database:** create it if it doesn't exist. **Don't** leave it in test mode; the rules deploy in step 7.
5. **Project settings → Your apps → Web app:** copy the config into `.env.local` (see `.env.example`). Set `VITE_USE_EMULATORS=false`.
6. **Google Cloud console → APIs & Services → Credentials:** restrict the browser API key to your Hosting domains (HTTP referrer restriction). Optional but recommended: enable **App Check** with reCAPTCHA Enterprise.
7. Install the CLI and deploy rules:

   ```bash
   npx firebase login
   ```

   ```bash
   npx firebase use --add
   ```

   ```bash
   npm run deploy:rules
   ```
8. **Bootstrap the first admin.** Sign up in the app. In **Authentication → Users**, copy your UID. Then in **Realtime Database → Data**, add `roles/<your-uid>` with the string value `admin`. The console bypasses security rules, so only project owners can do this. After that, admins can grant roles to others. M2 adds the UI for this; until then, use the console.

### Restricting sign-up to college emails (optional)

The client hint alone is not security. To enforce it, add `&& auth.token.email.matches(/.*@yourcollege\\.edu$/)` to the chat and posts `.write` rules, next to `auth.token.email_verified === true`. Then add a test for it.

## Deployment (Firebase Hosting)

```bash
npm run deploy
```

This builds into `dist/` and deploys Hosting and the database rules. `firebase.json` adds a Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` to every response. If you host somewhere else, copy those headers.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | yes (unless emulators) | Web API key. It identifies the project and is not a secret. Restrict it by referrer. |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | yes | RTDB URL |
| `VITE_FIREBASE_PROJECT_ID` | yes | |
| `VITE_FIREBASE_APP_ID` | optional | |
| `VITE_USE_EMULATORS` | optional | `true` connects to the local emulators |

Never commit `.env.local`, `.firebaserc` or any service-account JSON. `.gitignore` covers them.

## Data model

```
users/{uid}                    { displayName, rollNumber, createdAt }      owner + admin read
publicProfiles/{uid}           { displayName }                             signed-in read (single), not listable
rollIndex/{ROLL}               uid                                         admin read; first-claim write
roles/{uid}                    "student"|"senior"|"counselor"|"moderator"|"admin"   admin write
moderation/suspended/{uid}     { reason, by, at }                          moderator/admin write; self read
moderation/muted/{uid}         { reason, by, at }
rooms/general/messages/{id}    { uid, name, text≤1000, createdAt, votes/{uid}:true, hidden? }
posts/{id}                     { uid, name, text≤4000, createdAt, votes/{uid}:true, hidden? }
userData/{uid}/todos/{id}      { text≤500, done, createdAt }               owner only
userData/{uid}/streak/{YYYY-MM-DD}  integer 0–100                          owner only
```

Known limitations, planned for later milestones:

* **`hidden` hides content in the UI only.** RTDB rules can't filter individual children, so any verified user who queries the database can still read a hidden record. To actually remove content, a moderator deletes it. M2 adds a moderation queue and an audit log.
* **Vote counts are computed in the browser** from the `votes` map. That's fine at class scale. At larger scale, move to Cloud Function counters.
* **Roll numbers are first-come.** Someone could register another student's roll number before they do. An admin can delete the `rollIndex` entry. A verified roster import is planned.
* **Suspension has no expiry yet.** A moderator removes it by hand.

## Migrating from the legacy app

1. **Deploy `database.rules.json` before anything else.** The legacy database stores plain-text passwords at `user:*` keys, and its rules are almost certainly open.
2. Export the legacy data (Realtime Database → ⋮ → Export JSON) and store it somewhere private.
3. **Delete the `user:*`, `chat:messages`, `discuss:posts`, `todos:*` and `streak:*` nodes.** Tell users that their old Desk Lamp password was visible to others and should be changed anywhere they reused it.
4. Everyone creates a new account. Accounts aren't imported because the old ones carry no proof of identity. See `docs/AUDIT.md` §5.

## Manual test checklist

1. Sign up with a new email, display name and roll number. You land in the app with the "verify your email" banner, and Chat and Discussion are disabled.
2. Open the verification link (emulator terminal, or your inbox), then click **I've verified**. Chat and Discussion load.
3. Send a message, lift it, and check that it appears in Trending. Open a second browser profile as another user and confirm it updates in real time.
4. Post in Discussion and switch between Newest and Trending.
5. Add, tick and delete to-dos. Reload the page; they persist. As a second user, they're not visible.
6. Start a 25-minute focus session. To test quickly, temporarily set `data-len` to `0.1` in `index.html`. When it ends, today's heatmap cell darkens.
7. Sign up a second account with the same roll number. It should end on "Finish setting up" with an "already registered" error.
8. Sign out, then use **Forgot password?** You see the same message whether or not the email exists.
9. Untick "Keep me signed in", sign in, and close the tab. You're signed out when you reopen it.
10. In the database console, add `moderation/muted/<uid>`. That user can no longer post (they get an error), but can still vote.
