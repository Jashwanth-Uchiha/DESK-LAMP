# Desk Lamp — Audit of `study-hub_10.html` and Migration Plan

Audited file: `legacy/study-hub_10.html` (the Firebase config is redacted in the committed copy; 744 lines, single HTML file, Firebase JS SDK 10.13 compat, Realtime Database only).
Date: 2026-11-06.

## 1. Current architecture

| Area | How it works today |
|---|---|
| Hosting | One self-contained HTML file. CSS and JS are inline. No build, no tests. |
| Backend | Firebase Realtime Database (`desk-lamp-974c1`). No Firebase Auth, no Cloud Functions. |
| Storage layer | `sGet`/`sSet` try Firebase, then `window.storage`, then `localStorage`. Any Firebase error falls through to local storage without telling the user. |
| Identity | The user types an ID, a name and a password. `user:<id>` stores `{name, password}` **in plain text**, and the client compares passwords itself. |
| Chat | All messages live in **one array** at `chat:messages`. Every send or vote downloads the array, changes it and writes the whole thing back. It is trimmed to 300 items and polled every 3 s. |
| Discussion | Same pattern: one array at `discuss:posts`, polled every 4 s, never trimmed. |
| Votes | Arrays of voter IDs inside each message or post. |
| To-dos / streak | `todos:<id>` (array, addressed by index) and `streak:<id>` (map of day → count). They are "private" only because they are keyed by ID. |
| Themes | Applied from JS. The choice is saved in `localStorage`. |

## 2. Security issues (most severe first)

| # | Severity | Issue | Where |
|---|---|---|---|
| S1 | **Critical** | **Passwords are stored in plain text** in a database the browser reads directly. Anyone who fetches `user:<id>` gets that user's password. Students reuse passwords, so this exposes their other accounts too. | `doLogin`, line 384 |
| S2 | **Critical** | **No real authentication.** "Login" is a check done in the browser. Anyone can open the console, set `ME = {id:'victim', name:'Victim'}` and post as that person, or read and write `todos:<victim>` directly. | lines 373–391 |
| S3 | **Critical** | **The database is almost certainly in open "test mode".** The app has no auth, so it can only work with rules like `.read/.write: true`. Then anyone holding the (public) config can read every password, overwrite or delete all chat and posts, and read everyone's to-dos. | whole app |
| S4 | High | **Anyone can wipe the chat or the posts.** Clients write the whole array, so one malicious or buggy write of `[]` deletes everything. | `sendChat`, `addPost`, `vote` |
| S5 | High | **Stored XSS through IDs.** `onclick="voteMsg('${m.mid}')"` builds `mid` from the user's ID without escaping. An ID such as `x');alert(1);//` (or a record written straight to the DB) runs script in every viewer's browser. `initials(m.name)` is also inserted into HTML unescaped. | lines 429, 434, 479, 526 |
| S6 | High | **Account enumeration.** Typing any ID shows "Welcome back, <name>", which reveals who is registered and their real name. | `checkId` |
| S7 | Medium | **Path injection.** `fbPath` replaces only `. # $ [ ]`, so an ID containing `/` writes to nested paths such as `user:a/b`. | `fbPath` |
| S8 | Medium | **No logout, no session expiry, no account recovery, no password rules.** | — |
| S9 | Medium | **Writes can fail without the user knowing.** If Firebase errors, data goes to `localStorage` and the user believes it synced. | `sGet`/`sSet` |
| S10 | Low | The Firebase web config is committed in source. These values are *not* secrets (they identify the project), but the project depends entirely on security rules, and the API key has no restrictions or App Check. | lines 242–247 |
| S11 | Low | No Content-Security-Policy. Inline `onclick` handlers make CSP impossible to add. | — |

## 3. Reliability and correctness bugs

| # | Issue |
|---|---|
| B1 | **Lost writes.** Two people sending or voting at the same moment each write back the whole array, and the last write wins. Messages and votes disappear. |
| B2 | **Heatmap off by a day (visible in India, UTC+5:30).** `recordStreak` keys by the UTC date of "now". `renderStreak` keys local midnight through `toISOString()`, which in IST is the *previous* UTC day. Today's sessions are stored under a key the grid never shows. |
| B3 | Pomodoro counts down with `setInterval`. Browsers throttle background tabs, so the timer runs slow and a session can "finish" minutes late. |
| B4 | To-dos are addressed by array index. Two tabs editing at once tick or delete the wrong task. |
| B5 | Polling downloads the full chat and post arrays every 3–4 s per user. Bandwidth and RTDB cost grow with users × history. |
| B6 | Posts are never trimmed, so the array grows without limit. |
| B7 | There are no loading, empty or error states, apart from one empty-trending message. |
| B8 | Accessibility: inputs have only placeholders (no labels), tabs are clickable `<span>`s with no keyboard access, and there are no live regions for errors. |

## 4. Migration plan (prioritised)

Milestones are delivered one at a time. Each ends with tests, a build and a review.

| Milestone | Scope | Breaking? |
|---|---|---|
| **M1 — Secure foundation** *(this pass)* | Vite project layout; Firebase Auth (email + password, email verification, password reset, logout, "keep me signed in"); private profile vs public profile; unique roll numbers; roles stored in a rules-protected node; deny-by-default RTDB rules; chat, posts, to-dos and streak moved to per-record nodes; suspension and mute enforced by rules; heatmap and timer bugs fixed; no `innerHTML` with user data; CSP headers; unit tests and emulator rules tests. | **Yes.** Old `user:*` accounts cannot be migrated safely (see §5). |
| M2 — Admin & moderation | Admin dashboard, role management UI, hide/delete content, suspend/mute/block, reports queue, append-only audit log, statistics, confirmation dialogs. Probably Cloud Functions for audit-log integrity (needs the Blaze plan). | No |
| M3 — Anonymous counselling | Separate identity and pseudonymous records; counselor-only conversation access; confidentiality notice; requests, availability, scheduling, ending; safeguarding escalation; urgent-help page. Needs privacy review before launch. | No |
| M4 — Senior experience portal | Experience posts with an approval queue, filters, search, bookmarks, follow-up questions. | No |
| M5 — Academic community | Branch/year spaces, doubts with answers and accepted solutions, resource library (Storage + rules), mentorship, events and announcements, notifications, search. | No |
| M6 — Productivity upgrades | Weekly goals, learning progress, opt-in sharing. | No |
| M7 — Optional ML service | Python + scikit-learn spam and duplicate detection that **flags for human review only**, with evaluation and documented limits. Recommendations and semantic search come later. | No |

## 5. Data migration guidance

* **Accounts are not migrated.** The legacy records hold plain-text passwords with no proof of identity. Importing them would give whoever registered an ID first permanent ownership of it. Every student re-registers with Firebase Auth.
* **Delete the legacy `user:*` nodes as soon as M1 rules are deployed.** They contain passwords. Ask everyone who used Desk Lamp to change that password anywhere they reused it.
* **Chat and posts can be carried over** as read-only history. Export JSON from the Firebase console, convert each array element to a pushed record under an `legacy/` author with a `legacyName` field, and import with security rules bypassed (Admin SDK). M1 does not ship this script. The default recommendation is to archive the export and start fresh.
* To-dos and streaks can't be tied to a verified owner, so they are not migrated.
