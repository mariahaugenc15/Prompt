# Prompt

Real prompts. Real life. A social app built around real-world challenges instead of a feed to scroll.

This is the v1 MVP scoped in the concept brief, built as a mobile-first React app to validate the core loop before native. The calendar/prompts/feed/boards app still runs on mock/local data (zustand + localStorage) — there's no backend for that yet, so friend interactions there are simulated from a single-user point of view. Sign-up and the account/prompt system (Section 8: individual-to-individual send/complete, organization broadcast) are real, server-backed, and enforced server-side — see "Accounts & real prompts" below.

## Stack

- Client: React 19 + TypeScript + Vite, Tailwind CSS v4, React Router, Framer Motion, Zustand (persisted to `localStorage`).
- API: Express + SQLite (`better-sqlite3`), in `server/`.
- Validation shared between client and server: `shared/signupValidation.ts`.

## Running it

Two processes in development — the frontend and the API:

```
npm install
npm run server   # API on :8787 (SQLite file at server/.data/prompt.sqlite)
npm run dev      # frontend on :5173, proxies /api to the server above
```

`npm run build` / `npm run preview` also proxy `/api` to `:8787` (see `vite.config.ts`), so run `npm run server` alongside `npm run preview` too if you build for production locally.

## Deploying for real (not just a phone test)

Vercel is a good fit for the frontend, but **not** for `server/` as it stands — it's Express + SQLite (`better-sqlite3`), and Vercel's serverless functions have an ephemeral filesystem, so every cold start could mean a fresh, empty database. The split that actually works: **frontend on Vercel, backend on a host with a real, persistent disk mounted.**

1. **Deploy the backend to [Render](https://render.com)** using the included blueprint:
   - New → Blueprint → point at this repo. Render reads `render.yaml` and provisions a web service **with a 1GB persistent disk already attached** at `/var/data` — this is what makes accounts, prompts, comments, and uploaded photos/videos durable across deploys/restarts, not optional config. Requires a paid plan that supports disks (Render's free/Hobby tier can't attach one at all — the exact tier name varies by account: **Starter** on some, **Pro** on others).
   - `server/db.ts` reads the disk path from the `DATA_DIR` env var, which `render.yaml` sets to `/var/data` for you; `server/mediaStore.ts` writes uploaded media under that same path, so one disk covers both.
   - **If this service wasn't created via New → Blueprint** (e.g. you clicked New → Web Service instead, or it predates this file), Render won't read `render.yaml` automatically — the disk, build command, start command, and env vars all need to be set by hand in the dashboard (the service's Disks tab, Settings → Build & Deploy, and the Environment tab) to match what's described here and in the file's comments. Whichever way it's set up, verify the plan actually supports a disk before assuming data will survive a restart — running without one isn't a broken state (the app boots and works fine, falling back to a directory inside its own ephemeral container — see `server/db.ts`), it's just silently non-durable: everything resets on every restart, redeploy, and even a free-tier idle spin-down, with no error to signal it.
   - After creating it, set the **`CORS_ORIGIN`** env var (the blueprint declares it but leaves the value to you) to your Vercel URL once you have it from step 2 — e.g. `https://your-app.vercel.app`. Multiple origins can be comma-separated. Until it's set, CORS is wide open (fine for a first test, not for leaving running indefinitely — see `server/index.ts`).
   - Note the service's public URL (e.g. `https://prompt-api.onrender.com`) — you need it in step 2.
   - Prefer Railway or Fly.io instead? Same two things matter wherever you deploy: run `npm install` / `npm start` (not `npm run server` — that's the file-watching dev command), and set `DATA_DIR` to a path on a volume that actually persists — both platforms support mounting one similarly to Render's disk above.

2. **Deploy the frontend to Vercel**:
   - Import this repo at [vercel.com/new](https://vercel.com/new). It should auto-detect Vite; `vercel.json` in this repo pins the build command/output dir and adds the SPA fallback rewrite React Router needs (without it, refreshing on `/profile` or opening `/o/:username` directly 404s on static hosting).
   - Add an environment variable **`VITE_API_BASE_URL`** = the backend URL from step 1 (no trailing slash, e.g. `https://prompt-api.onrender.com`). Every API call is built from this at build time (`src/lib/apiBase.ts`) — without it, the deployed frontend tries to call itself for `/api/...` and gets nothing back.
   - Deploy. If you set `CORS_ORIGIN` on the backend before this, your Vercel URL needs to already match it (or come back and update it after Vercel gives you the final URL, then redeploy the backend).

3. **Open it on your phone**: just visit the Vercel URL in a mobile browser. It's a real installable PWA (see below) — "Add to Home Screen" (iOS Safari) or the browser's own install prompt (Android Chrome) gives it an icon, a full-screen launch with no browser chrome, and an offline-capable app shell.

### Progressive Web App

- `vite-plugin-pwa` generates `manifest.webmanifest` and a Workbox service worker at build time (`vite.config.ts`) — nothing to configure per-deploy, it's baked into `npm run build`.
- The app shell (HTML/JS/CSS/fonts/icons) is precached, so the app still opens — flip screen and all — with zero network connection. API calls (`/api/*`) are deliberately excluded from precaching and go network-first instead: real data is never silently served stale when a connection actually exists, and the cache only kicks in as a fallback if a request would otherwise fail outright offline.
- `registerType: 'autoUpdate'` means a new deploy's service worker takes over silently on next load — no "update available" prompt to build or wire up.
- Icons live in `public/icons/` (`icon-192.png`, `icon-512.png`, a dedicated `icon-maskable-512.png` sized to Android's adaptive-icon safe zone, and `apple-touch-icon.png`) plus the iOS-specific meta tags in `index.html` — iOS ignores the web manifest for home-screen behavior and needs those separately.
- This is genuinely installable today (verified: service worker registers and activates, and a fully offline reload still renders the app) — but it is not, by itself, an App Store listing. The `ios/` project below is that native wrapper.

### Native iOS app (Xcode via Capacitor)

`ios/` is a real Xcode project, generated with [Capacitor](https://capacitorjs.com), that loads this same web app as its content — not a from-scratch native rewrite. **Requires a Mac with Xcode installed**; none of the commands below can run in this repo's own dev environment (this app was built and the `ios/` project generated from a Linux container, which can produce the project files but can't open or build them).

To open and run it:

1. `npm install` (pulls in `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli` alongside everything else).
2. Point the build at your deployed backend, the same way the Vercel deploy does — set `VITE_API_BASE_URL` to your Render (or other) backend's public URL before building, e.g. in a local `.env.production`:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com
   ```
   Skipping this makes the packaged app try to call itself for `/api/...`, the same failure mode as skipping it on Vercel (see above).
3. `npm run ios:sync` — builds the web app and copies it into `ios/App/App/public` (`npx cap sync ios` under the hood; re-run this after any change to `src/` or `public/` you want reflected in the app).
4. `npm run ios:open` — opens `ios/App/App.xcodeproj` in Xcode (`npx cap open ios`). From there, pick a simulator or a connected device and hit Run, same as any other Xcode project.

A few things worth knowing before going further:

- **`appId` in `capacitor.config.ts`** (`com.promptsocial.app`) is a placeholder — change it to a bundle identifier registered under your own Apple Developer account before attempting a real App Store submission. Safe to leave as-is just to build and run locally first.
- **No CocoaPods needed** — this Capacitor version links its (currently zero) native plugins via Swift Package Manager, so there's no `pod install` step and no `Podfile` to keep in sync.
- **The app icon and launch screen are still Capacitor's defaults** (`ios/App/App/Assets.xcassets`) — swapping in this app's own icon (`public/icons/`) is a manual step in Xcode's asset catalog editor, not something `cap sync` does for you.
- Push notifications, camera access, and anything else genuinely native would go through Capacitor plugins (e.g. `@capacitor/push-notifications`) added later — none are wired up yet, so today this is a web app in a native shell, not a fully native rebuild.

**What "live" does and doesn't mean here.** The real, server-backed account system (sign-up, login, 1:1 prompts, org broadcasts — "Accounts & real prompts" below) is genuinely multi-user once deployed this way: two different phones, two different accounts, real interaction, durable data. The calendar/feed/boards mock layer is still local-only per device (see "Known simplifications") — deploying it doesn't change that; it's a separate, deliberate scope decision, not a limitation of the hosting.

## What's implemented (v1 scope from the brief)

- **Calendar-flip login** (`src/pages/LoginFlip.tsx`) — the signature front-door interaction: a closed planner cover flips open, then leads into real Sign Up. The flip is a ritual, not an access grant — there's no credential-less path into a profile; a returning device that's already signed up flips straight into its own calendar instead (`loggedIn` persists until Sign Out).
- **Fridge-note prompts** (`src/components/FridgeNote.tsx`) — incoming prompts pin to the top of the calendar like a sticky note; accepting "writes" the prompt into today's cell, declining tosses it with no penalty.
- **Calendar month-grid profile** (`src/components/CalendarGrid.tsx`) — default "All Activity" view, in-progress prompts shown dashed, completed prompts filled in with proof.
- **Send-a-prompt flow** — pick a friend, category, library prompt or custom text, optional anonymity, with a "pin to their fridge" send ritual.
- **Following + Community feeds** (`src/pages/Feed.tsx`) — Pinterest-style grid, upvote + pin, no comments.
- **Community boards** — create a public/invite-only board, subscribe, owner broadcasts a prompt to subscribers as a fridge-note, basic participation counts + submission gallery.
- **Completion Score** — percentage of received friend prompts actually completed, shown on profile; only counts resolved outcomes (completed/declined/expired), not prompts still sitting unopened or in progress.
- **Prompt Permissions** — Everyone / Followers / Mutuals-only (recommended default), enforced against the mock social graph.

## Sign-up validation

- `shared/signupValidation.ts` holds format validation for both account types, branching once on `accountType` rather than duplicating the individual/organization paths. Both the client (`src/pages/SignUp.tsx`) and server (`server/index.ts`) import it, so the rules can't drift apart.
- **Username uniqueness**: one namespace shared by individuals and organizations, case-insensitive ("MariaH" and "mariah" collide). Enforced with a real unique index in SQLite on a lowercase-normalized column (`server/db.ts`) — not just an application-level check. A duplicate that somehow gets past the pre-check (a race between two concurrent signups) still gets rejected by the database, and the server translates that rejection back into the same field error.
- **Real-time check**: the username field calls `GET /api/signup/check-username` on a 400ms debounce as you type, showing available/taken inline. This is a UX convenience only — `POST /api/signup` re-validates and re-checks uniqueness from scratch server-side and is the actual gate, since the earlier "available" response can go stale by the time you submit.
- **Field-level errors**: both client and server return/display errors per field (`{"errors": {"username": "...", "email": "..."}}`), never a generic "sign-up failed."
- **Password baseline**: the brief didn't specify strength rules, so this defaults to a reasonable baseline (8+ characters, at least one letter and one number) rather than assuming something stricter. Passwords are hashed with `scrypt` (Node's built-in, salted per-account) — never stored in plaintext.
- **Website URL** (organizations): format-validated only (must parse as a URL with a real-looking domain). **Decision point, not assumed**: this does *not* verify the site is actually live with an HTTP request. That's a reasonable next step, but it adds latency to signup, can false-negative on sites that block server-side/bot requests, and raises an SSRF consideration (the server would be making outbound requests to arbitrary user-supplied hosts) that needs deliberate handling — worth an explicit decision rather than silently bolting on.

## Accounts & real prompts (Section 8)

Real, multi-account, server-enforced — not the mock single-user prototype above. Sign up twice (two browsers, or one incognito) to try the individual-to-individual loop; sign up once as an organization to try broadcasting.

- **Session**: sign-up or `/login` mints a random bearer token (`server/auth.ts`), returned once and stored client-side; every account/prompt request sends it as `Authorization: Bearer <token>`. One token per account at a time (a new login overwrites the old one), `POST /api/logout` rotates it away explicitly, and it expires server-side after 90 days regardless. `/forgot-password` + `/reset-password` cover a lost password (emails via SMTP env vars in production, logs to the server console in dev — see `server/emailer.ts`).
- **Where it lives in the UI**: organizations land on their own page (`/o/:username`) straight out of sign-up — a page, not a personal profile, per the brief. Individuals continue into the real calendar/feed app, with a "Real account" section on Profile linking to a real send flow (`/real/send`).
- **Permission matrix is centralized, not scattered**: every route that sends, receives, broadcasts, or follows calls into `server/permissions.ts` rather than re-deriving the rule inline (`canFollow`, `canSendOneToOne`, `canReceiveOneToOne`, `canBroadcast`, `canCompleteBroadcast`). Organizations are hard-blocked from sending 1:1, receiving 1:1, and following anyone; individuals send/receive 1:1 subject to their Everyone/Followers/Mutuals tier (`PATCH /api/me/prompt-permission`), checked against real rows in the `follows` table, not client state.
- **Auto-tag captions**: completing a prompt (`POST /api/prompts/:id/complete`) has the server — never the client — generate the `"{sender} prompted: '{text}'"` lead-in and store it separately from the completer's own caption, so the UI can always reconstruct who prompted / what they said / what the completer added, even though it renders as one combined caption. Both accounts are tagged on the result (sender + completer).
- **Broadcast data model**: one `prompts` row per broadcast (`is_broadcast = 1`, `recipient_account_id = NULL`), with each follower's completion as its own row in `prompt_completions` — never duplicated as separate prompt rows per follower. A follower can complete a given broadcast exactly once (unique index on `prompt_id, completer_account_id`); completing an already-completed one is a clean 409, including when two requests race past the same check (verified by triggering the real unique-constraint violation, not just the pre-check).
- **Verified accounts and two-factor authentication (Section 8.4)** are real — see "Verification & two-factor authentication" below.

## Verification & two-factor authentication

Organizations and high-profile individuals (athletes, creators, public figures) can request a reviewed verified badge — similar in spirit to platforms like Instagram — so a viewer can tell who Prompt actually confirmed apart from anyone using a similar name.

- **Requesting it**: any signed-in account can submit a request from Profile (category, supporting links, a written explanation) — `POST /api/verification/request`. It sits in `verification_requests` until an admin reviews it in the dashboard; nothing is auto-approved.
- **Follower minimum**: also requires more than `MIN_FOLLOWERS_FOR_VERIFICATION` (`server/verificationRoutes.ts`, currently 1,000) real followers — a stand-in for "high-profile," enforced server-side against actual rows in the `follows` table, not anything the client asserts. Profile shows real-time progress toward it (`GET /api/verification/status` returns the account's current follower count alongside the threshold) rather than only surfacing the requirement after a failed submit.
- **2FA is a prerequisite, not an add-on**: a verified badge makes an account a more valuable target for takeover than an ordinary one, so requesting verification (and staying verified) requires two-factor authentication already turned on. Turning 2FA back off automatically clears a verified badge — the protection it was granted under is gone, so the badge can't outlive it.
- **Two-factor authentication** is TOTP (RFC 6238 — any authenticator app: Google Authenticator, Authy, 1Password, etc.), implemented from scratch in `server/totp.ts` with no third-party auth service or paid SMS provider (this app has no SMS infrastructure to begin with). Setup shows the raw secret for manual entry (no QR code — that would need an image-generation dependency this project doesn't otherwise carry) plus 8 one-time backup codes shown exactly once, for recovering access if the authenticator device is lost.
- **Login changes shape once 2FA is on**: a correct password no longer returns a session token directly — `POST /api/login` responds with a short-lived `loginToken` instead, and the client makes one more call (`POST /api/login/totp`) with a 6-digit code or a backup code to actually finish logging in (`server/pendingLoginRepo.ts`). Password reset (`/api/password-reset/confirm`) goes through the same second step for a 2FA-enabled account — resetting a password only proves control of the inbox, not the second factor, so it can't be used to walk around 2FA.
- **Review and revocation**: the admin dashboard's Verification tab approves or rejects pending requests (with a note the requester can see), and the Accounts tab can revoke an already-verified account's badge independently, for when one needs to come back later.

## Admin dashboard & trust & safety

Keeping a growing user base safe needs someone able to see what's been flagged and act on it — this is a self-contained tool for that, not a public feature.

- **Reporting**: any signed-in account can flag an account, a completion (post), a board, or a comment (`POST /api/report`) with a free-text reason. The reporter's own verified account email is always attached server-side (`req.account.email`, never something the client sends) so an admin has a real address to follow up with.
- **Feedback**: `POST /api/feedback` is the open-ended counterpart — not tied to any post, a direct line to the people running the app, same email-attached pattern.
- **Comments**: real comments on completions (`GET`/`POST /api/completions/:id/comments`, `DELETE /api/comments/:id` for your own) — soft-deleted (not hard-deleted) so a moderator's removal leaves an audit trail rather than erasing evidence.
- **Admin role**: `accounts.is_admin`, granted by listing usernames (comma-separated) in the **`ADMIN_USERNAMES`** env var — checked and applied on every server start (`server/db.ts`), so it works even if the account signs up after the var is set. There's deliberately no "downgrade" from here — removing a name from the list doesn't revoke access already granted; do that from the dashboard (ban) or direct DB access.
- **Dashboard**: a single self-contained HTML page (`server/adminPanel.html`, no build step) served at **`/admin`** by this same backend. It logs in through the existing `/api/login` endpoint (so there's no separate credential system) and, once `isAdmin` comes back true from `/api/me`, calls `/api/admin/*` (all gated by `requireAuth` + `requireAdmin`) to:
  - see usage stats (all-time users, active users over 30 days/today, daily-average active users) on an Overview tab,
  - review pending verification requests and **approve** or **reject** them (see "Verification & two-factor authentication" above),
  - browse/search every account, **ban** one (reuses the same anonymize-and-lock path a self-delete takes — `accountsRepo.ts`'s `deactivateAccount`), and **revoke** an already-verified account's badge,
  - review reports and feedback, filter open vs. resolved, and mark either **resolved** (with an optional note) or reopen it,
  - browse all comments (including removed ones, for audit) and remove one.
- Set `ADMIN_USERNAMES` in your deployment env (see `render.yaml`) to whichever of your own usernames should have access, then visit `https://your-backend-host/admin`.

## Deliberately out of scope (per the brief's fast-follow list)

Geo-discovery, invite-only board member-adds, custom named calendars, "share my month" export, audio prompts, board analytics dashboards, monetization, segmented completion scores.

## Known simplifications

- The mock calendar/prompts/feed/boards app is still single-user simulation, and it doesn't talk to the real accounts backend at all — but it now requires the real account system to enter at all (see "Calendar-flip login" above), so it's real people using a local-only demo layer, not a fake profile handed out for free. A real sign-up starts with a genuinely empty feed, board list, and calendar list — no fabricated pre-existing posts, boards, or calendars. The one thing that's still fixed rather than real is the small roster of "people" (`src/lib/seed.ts`) the simulation follows/receives from/sends to — there's no backend for this layer, so without *some* other party the accept/decline/complete loop would have no way to ever start. "Explore prompts" (`/explore`) surfaces real public board challenges instead of fabricated ones, but is necessarily sparse on a fresh account since only that account can create boards on its own device until boards move onto the real backend. Sign-up and the Section 8 account/prompt system are the real, multi-account exception.
- Proof photos (both the mock app's and the real one's) are downscaled and stored as data URLs — in `localStorage` for the mock app, as a column value in SQLite for the real one — fine for a prototype, not how media would be handled with a real backend/media pipeline (object storage + CDN URLs, not inline base64).
- `/login` (`POST /api/login`) lets you get back into an existing real account from a fresh browser/device — case-insensitive username, `scrypt` password check via `crypto.timingSafeEqual`, same generic "Incorrect username or password" whether the username doesn't exist or the password is wrong (no account-enumeration side channel), and a freshly-rotated bearer token that invalidates whatever token you had before. There's still no session *expiry* — a token is valid until the next login rotates it — which is the one piece left before this is a real auth system rather than a stand-in.
