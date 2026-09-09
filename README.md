# Prompt

Real prompts. Real life. A social app built around real-world challenges instead of a feed to scroll.

This is the v1 MVP scoped in the concept brief, built as a mobile-first React app to validate the core loop before native. It runs entirely on mock/local data (zustand + localStorage) — there's no backend yet, so friend interactions are simulated from a single-user point of view.

## Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, React Router, Framer Motion, Zustand (persisted to `localStorage`).

## Running it

```
npm install
npm run dev
```

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

## Deliberately out of scope (per the brief's fast-follow list)

Geo-discovery, invite-only board member-adds, custom named calendars, "share my month" export, audio dares, board analytics dashboards, monetization, segmented completion scores.

## Known simplifications

- Single-user simulation: there's no real multiplayer backend, so friends' actions (other than pre-seeded sample feed content) are simulated via a "Simulate a dare" button on the calendar screen.
- Proof photos are downscaled and stored as data URLs in `localStorage` — fine for a prototype, not how media would be handled with a real backend/media pipeline.
