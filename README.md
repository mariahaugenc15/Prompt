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
   - New → Blueprint → point at this repo. Render reads `render.yaml` and provisions a web service **with a 1GB persistent disk already attached** at `/var/data` — this is the part that makes accounts durable across deploys/restarts, not optional config.
   - This requires Render's **Starter plan** (~$7/mo) — a free web service cannot attach a disk at all, so don't deploy this on the free tier expecting data to survive a redeploy.
   - `server/db.ts` reads the disk path from the `DATA_DIR` env var, which `render.yaml` sets to `/var/data` for you.
   - After creating it, set the **`CORS_ORIGIN`** env var (the blueprint declares it but leaves the value to you) to your Vercel URL once you have it from step 2 — e.g. `https://your-app.vercel.app`. Multiple origins can be comma-separated. Until it's set, CORS is wide open (fine for a first test, not for leaving running indefinitely — see `server/index.ts`).
   - Note the service's public URL (e.g. `https://prompt-api.onrender.com`) — you need it in step 2.
   - Prefer Railway or Fly.io instead? Same two things matter wherever you deploy: run `npm install` / `npm run server`, and set `DATA_DIR` to a path on a volume that actually persists — both platforms support mounting one similarly to Render's disk above.

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
- This is genuinely installable today (verified: service worker registers and activates, and a fully offline reload still renders the app) — but it is not, and can't become, an App Store / Play Store listing. That requires either a native wrapper (Capacitor) with a Mac in the loop for the iOS build, or a native rewrite — a separate, much larger project than a PWA manifest.

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

- **Session**: sign-up (or `/login`, see below) mints a random bearer token (`server/auth.ts`), returned once and stored client-side; every account/prompt request sends it as `Authorization: Bearer <token>`. It's a stand-in for real sessions (no expiry yet), not a replacement for one.
- **Where it lives in the UI**: organizations land on their own page (`/o/:username`) straight out of sign-up, not the mock calendar — a page, not a personal profile, per the brief. Individuals keep going into the mock app as before, and get a "Real account" section on Profile linking to a real inbox (`/real/inbox`) and a real send flow (`/real/send`).
- **Permission matrix is centralized, not scattered**: every route that sends, receives, broadcasts, or follows calls into `server/permissions.ts` rather than re-deriving the rule inline (`canFollow`, `canSendOneToOne`, `canReceiveOneToOne`, `canBroadcast`, `canCompleteBroadcast`). Organizations are hard-blocked from sending 1:1, receiving 1:1, and following anyone; individuals send/receive 1:1 subject to their Everyone/Followers/Mutuals tier (`PATCH /api/me/prompt-permission`), checked against real rows in the `follows` table, not client state.
- **Auto-tag captions**: completing a prompt (`POST /api/prompts/:id/complete`) has the server — never the client — generate the `"{sender} prompted: '{text}'"` lead-in and store it separately from the completer's own caption, so the UI can always reconstruct who prompted / what they said / what the completer added, even though it renders as one combined caption. Both accounts are tagged on the result (sender + completer).
- **Broadcast data model**: one `prompts` row per broadcast (`is_broadcast = 1`, `recipient_account_id = NULL`), with each follower's completion as its own row in `prompt_completions` — never duplicated as separate prompt rows per follower. A follower can complete a given broadcast exactly once (unique index on `prompt_id, completer_account_id`); completing an already-completed one is a clean 409, including when two requests race past the same check (verified by triggering the real unique-constraint violation, not just the pre-check).
- **Verified/Influencer accounts, the per-person allowlist, and the admin verification-review queue (Section 8.4) are deliberately not built** — the MVP doc (Section 11) explicitly defers them. `server/permissions.ts` is written so that row slots into the existing functions later without changing any of their callers.

## Deliberately out of scope (per the brief's fast-follow list)

Geo-discovery, invite-only board member-adds, custom named calendars, "share my month" export, audio prompts, board analytics dashboards, monetization, segmented completion scores.

## Known simplifications

- The mock calendar/prompts/feed/boards app is still single-user simulation, and it doesn't talk to the real accounts backend at all — but it now requires the real account system to enter at all (see "Calendar-flip login" above), so it's real people using a local-only demo layer, not a fake profile handed out for free. A real sign-up starts with a genuinely empty feed, board list, and calendar list — no fabricated pre-existing posts, boards, or calendars. The one thing that's still fixed rather than real is the small roster of "people" (`src/lib/seed.ts`) the simulation follows/receives from/sends to — there's no backend for this layer, so without *some* other party the accept/decline/complete loop would have no way to ever start. "Explore prompts" (`/explore`) surfaces real public board challenges instead of fabricated ones, but is necessarily sparse on a fresh account since only that account can create boards on its own device until boards move onto the real backend. Sign-up and the Section 8 account/prompt system are the real, multi-account exception.
- Proof photos (both the mock app's and the real one's) are downscaled and stored as data URLs — in `localStorage` for the mock app, as a column value in SQLite for the real one — fine for a prototype, not how media would be handled with a real backend/media pipeline (object storage + CDN URLs, not inline base64).
- `/login` (`POST /api/login`) lets you get back into an existing real account from a fresh browser/device — case-insensitive username, `scrypt` password check via `crypto.timingSafeEqual`, same generic "Incorrect username or password" whether the username doesn't exist or the password is wrong (no account-enumeration side channel), and a freshly-rotated bearer token that invalidates whatever token you had before. There's still no session *expiry* — a token is valid until the next login rotates it — which is the one piece left before this is a real auth system rather than a stand-in.
