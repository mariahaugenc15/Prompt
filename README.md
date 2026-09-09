# Prompt

Real prompts. Real life. A social app built around real-world challenges instead of a feed to scroll.

This is the v1 MVP scoped in the concept brief, built as a mobile-first React app to validate the core loop before native. The core app loop (calendar, dares, feed, boards) still runs on mock/local data (zustand + localStorage) — there's no backend for that yet, so friend interactions are simulated from a single-user point of view. Sign-up is the one real, server-backed piece so far: it has an actual API and database enforcing its rules.

## Stack

- Client: React 19 + TypeScript + Vite, Tailwind CSS v4, React Router, Framer Motion, Zustand (persisted to `localStorage`).
- Sign-up API: Express + SQLite (`better-sqlite3`), in `server/`.
- Validation shared between client and server: `shared/signupValidation.ts`.

## Running it

Two processes in development — the frontend and the sign-up API:

```
npm install
npm run server   # sign-up API on :8787 (SQLite file at server/.data/prompt.sqlite)
npm run dev      # frontend on :5173, proxies /api to the server above
```

`npm run build` / `npm run preview` also proxy `/api` to `:8787` (see `vite.config.ts`), so run `npm run server` alongside `npm run preview` too if you build for production locally.

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

## Deliberately out of scope (per the brief's fast-follow list)

Geo-discovery, invite-only board member-adds, custom named calendars, "share my month" export, audio dares, board analytics dashboards, monetization, segmented completion scores.

## Known simplifications

- Single-user simulation: there's no real multiplayer backend for the app itself yet, so friends' actions (other than pre-seeded sample feed content) are simulated via a "Simulate a dare" button on the calendar screen. Sign-up is the exception — it's a real API/DB.
- Proof photos are downscaled and stored as data URLs in `localStorage` — fine for a prototype, not how media would be handled with a real backend/media pipeline.
- No login (password-check) flow yet, no sessions/JWTs — sign-up creates a real account row, and on success the app just treats you as entered (matching how the rest of the prototype has no real auth). Wiring an actual login form against the stored password hash is a natural next step.
