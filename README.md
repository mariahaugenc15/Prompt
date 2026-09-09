# Prompt

Real prompts. Real life. A social app built around real-world challenges instead of a feed to scroll.

This is the v1 MVP scoped in the concept brief, built as a mobile-first React app to validate the core loop before native. The calendar/dares/feed/boards app still runs on mock/local data (zustand + localStorage) — there's no backend for that yet, so friend interactions there are simulated from a single-user point of view. Sign-up and the account/prompt system (Section 8: individual-to-individual send/complete, organization broadcast) are real, server-backed, and enforced server-side — see "Accounts & real prompts" below.

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

## Deploying (e.g. to test on a phone)

Vercel is a good fit for the frontend, but **not** for `server/` as it stands — it's Express + SQLite (`better-sqlite3`), and Vercel's serverless functions have an ephemeral filesystem, so every cold start could mean a fresh, empty database. The split that actually works: **frontend on Vercel, backend on a host with a real persistent disk** (Render, Railway, and Fly.io all have a free/cheap tier that fits this).

1. **Deploy the backend first** (example: [Render](https://render.com), free web service):
   - New Web Service → point at this repo.
   - Build command: `npm install`. Start command: `npm run server`.
   - It reads `PORT` from the environment automatically (`server/index.ts`); Render sets that for you.
   - Set an environment variable `CORS_ORIGIN` once you know your Vercel URL (step 2) — e.g. `https://your-app.vercel.app`. Multiple origins can be comma-separated. Until you set it, CORS is wide open (fine for a first test, not for leaving running indefinitely — see `server/index.ts`).
   - Note its public URL (e.g. `https://prompt-api.onrender.com`) — you need it in step 2.
   - Render's free tier disk is not guaranteed durable across redeploys/restarts — fine for clicking around, not for data you care about keeping. For that, swap SQLite for a hosted Postgres (Render/Neon/Supabase all have a free tier) — a real change to `server/db.ts`, not a config flag.

2. **Deploy the frontend to Vercel**:
   - Import this repo at [vercel.com/new](https://vercel.com/new). It should auto-detect Vite; `vercel.json` in this repo pins the build command/output dir and adds the SPA fallback rewrite React Router needs (without it, refreshing on `/profile` or opening `/o/:username` directly 404s on static hosting).
   - Add an environment variable **`VITE_API_BASE_URL`** = the backend URL from step 1 (no trailing slash, e.g. `https://prompt-api.onrender.com`). Every API call is built from this at build time (`src/lib/apiBase.ts`) — without it, the deployed frontend tries to call itself for `/api/...` and gets nothing back.
   - Deploy. If you set `CORS_ORIGIN` on the backend before this, your Vercel URL needs to already match it (or come back and update it after Vercel gives you the final URL, then redeploy the backend).

3. **Open it on your phone**: just visit the Vercel URL in a mobile browser — it's a responsive web app, not a native build, so there's nothing to install. "Add to Home Screen" gives it an icon and full-screen launch, but there's no web app manifest or service worker yet, so it won't behave like an installable PWA (offline support, etc.) — a small addition if you want that next.

## What's implemented (v1 scope from the brief)

- **Calendar-flip login** (`src/pages/LoginFlip.tsx`) — the signature front-door interaction: a closed planner cover flips open onto today's calendar page.
- **First-time onboarding** — empty calendar, prompts you to follow a friend or subscribe to a starter board before entering the app.
- **Fridge-note dares** (`src/components/FridgeNote.tsx`) — incoming dares pin to the top of the calendar like a sticky note; accepting "writes" the dare into today's cell, declining tosses it with no penalty.
- **Calendar month-grid profile** (`src/components/CalendarGrid.tsx`) — default "All Activity" view, in-progress dares shown dashed, completed dares filled in with proof.
- **Send-a-prompt flow** — pick a friend, category, library challenge or custom text, optional anonymity, with a "pin to their fridge" send ritual.
- **Following + Community feeds** (`src/pages/Feed.tsx`) — Pinterest-style grid, upvote + pin, no comments.
- **Community boards** — create a public/invite-only board, subscribe, owner broadcasts a challenge to subscribers as a fridge-note, basic participation counts + submission gallery.
- **Completion Score** — percentage of received friend dares actually completed, shown on profile; only counts resolved outcomes (completed/declined/expired), not dares still sitting unopened or in progress.
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

Geo-discovery, invite-only board member-adds, custom named calendars, "share my month" export, audio dares, board analytics dashboards, monetization, segmented completion scores.

## Known simplifications

- The mock calendar/dares/feed/boards app is still single-user simulation — friends' actions there (other than pre-seeded sample feed content) are simulated via a "Simulate a dare" button, and it doesn't talk to the real accounts backend at all. Sign-up and the Section 8 account/prompt system are the real, multi-account exception.
- Proof photos (both the mock app's and the real one's) are downscaled and stored as data URLs — in `localStorage` for the mock app, as a column value in SQLite for the real one — fine for a prototype, not how media would be handled with a real backend/media pipeline (object storage + CDN URLs, not inline base64).
- `/login` (`POST /api/login`) lets you get back into an existing real account from a fresh browser/device — case-insensitive username, `scrypt` password check via `crypto.timingSafeEqual`, same generic "Incorrect username or password" whether the username doesn't exist or the password is wrong (no account-enumeration side channel), and a freshly-rotated bearer token that invalidates whatever token you had before. There's still no session *expiry* — a token is valid until the next login rotates it — which is the one piece left before this is a real auth system rather than a stand-in.
