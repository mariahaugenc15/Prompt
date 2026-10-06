# Prompt v2 changelog

Everything below shipped as its own commit on `claude/prompt-app-concept-build-iu5wvo`, in phase order. Each phase's commit message has the full detail; this groups the same work by kind for a reviewer, plus what needs to happen outside the code to run it.

## Design

- **Today highlight** (Phase 2.1): today's calendar cell now gets a distinct terra-cotta outline and a matching soft drop shadow (new `--shadow-today` token), separate from the existing "has completions" cover-photo state, so both can be true on the same day without clashing. Updates itself at local midnight with no app restart.
- **Ambient time-of-day background** (Phase 7.1): every screen now sits in front of a faint, line-work scene that shifts with the time of day (sunrise lines, then sun and trees, then moon/stars/clouds), matching the existing icon stroke style and kept low-opacity enough to never compete with text. Crossfades smoothly between phases; goes fully static under `prefers-reduced-motion`.
- **Branded loading indicator** (Phase 7.3): a slowly turning line-work leaf (`LoadingMark`) replaces every plain "Loading..." label app-wide, matching `Icons.tsx`'s stroke style instead of a generic spinner.
- **Tasteful hover affordance** (Phase 7.3): buttons and links lift slightly on hover, scoped to pointer-capable devices so touch and keyboard focus are unaffected.

## Functionality

- **Calendar month navigation fixed** (Phase 1.1): Home, the public profile, and calendar detail no longer get stuck unable to see last month once the month rolls over; added prev/next controls bounded to the account's/calendar's own creation date.
- **Continuous scrollable month feed** (Phase 2.2): Home's calendar is now a vertically scrolling stack of months (newest first, lazily loaded) instead of one fixed month, reaching all the way back to the account's creation month.
- **Editable username** (Phase 1.2): `PATCH /api/me/username`, format- and uniqueness-checked server-side, with a configurable cooldown between changes. Every reference elsewhere in the schema is by account id, so a rename never breaks anything already posted.
- **True audio response for "Sound it"** (Phase 1.3): in-app voice recording (record/re-record/playback/submit) instead of reusing the photo/video form, with a server-enforced size cap and an audio player wherever that submission is shown.
- **Three-way reactions** (Phase 3.1): like/dislike/laugh (mutually exclusive) replace the old single upvote; pin stays independent. A visibility check was added to comments and reactions so a private 1:1 completion's comments/reactions can't be read or added to by someone outside that conversation.
- **Expand to see full detail** (Phase 3.1): tapping a card in the feed or a board's submission gallery now opens a detail view with the full comment thread and reaction bar, matching what the day-detail view already showed inline.
- **Notification preferences** (Phase 4): a settings screen with a master switch and one toggle per event (new follower, new prompt received, prompt completed), plus an in-app notification list and an unread badge. Push subscriptions are now cleaned up on logout and account deletion.
- **Adult-content board flag** (Phase 5.1): board owners (or an admin) can mark a board 18+. Flagged boards are excluded from Discover/search/cross-board discovery for anyone who hasn't opted in, enforced server-side (403 on direct API access too, not just hidden in the UI).
- **Top Fans leaderboard** (Phase 5.2): board owners can see subscribers ranked by response rate across all boards they run, with a minimum-received threshold so a single lucky completion can't outrank a long consistent history. Owners can optionally publish it; individual accounts can opt out of appearing in it.
- **Permanent account delete** (Phase 6): a separate, stricter action from Ban. Requires re-typing the exact username (checked server-side), deletes the account's own avatar and every row that's purely about that one account, and leaves shared content (prompts, completions, board/calendar ownership) intact under the anonymized identity so other people's history isn't disrupted.
- **Admin audit log** (Phase 6): every ban, permanent delete, and CSV export is now recorded (who, whom, when, a short detail string) in a log an admin can review.
- **Contact-all-users broadcast email** (Phase 6): admins can email every non-unsubscribed account from the dashboard, with a required test send, a server-enforced confirm step, batched delivery, a per-recipient unsubscribe link, and a send history.

## User Experience

- UI copy sweep for consistent wording across empty states, errors, and settings (part of every phase above, and a final dedicated pass, see "Final notes" below).
- Push permission and notification settings are now self-service and discoverable from a bell icon with an unread badge, instead of being silent or all-or-nothing.
- The adult-content gate shows a clear, tap-to-confirm interstitial rather than silently hiding content, once an account has opted in at the profile level.

## Admin Panel

- New **Broadcast** tab: compose, preview, send a test to yourself, and send to everyone, with send history.
- New **Audit Log** tab: a running record of admin actions (ban, delete, export).
- New **Delete** action next to Ban on the accounts table, gated by a username-confirmation prompt.

## Animations

- **Send-a-prompt animation rewritten** (Phase 7.2): the sticky-note send animation is now a slower, more deliberate ~2 second sequence (a squiggle draws in as if still being written, the note creases as if folding, then peels free and arcs off-screen) instead of the old 1.1 second lift-and-arc. Falls back to a plain fade under `prefers-reduced-motion`, and never blocks navigating away mid-animation.
- **Ambient background animation** (Phase 7.1): gentle, slow drift/arc/twinkle per time-of-day scene, static under `prefers-reduced-motion`.
- **Loading indicator animation** (Phase 7.3): the leaf mark turns slowly while active, static under `prefers-reduced-motion`.

## Migrations to run

None by hand. Every schema change in this release is either a `CREATE TABLE IF NOT EXISTS` (new installs) or a defensive `ALTER TABLE ADD COLUMN` with a safe default, both run automatically by `server/db.ts` the next time the server starts, against the existing production database. New columns/tables added this release:

- `accounts`: `username_changed_at`, `notify_master`, `notify_new_follower`, `notify_new_prompt`, `notify_prompt_completed` (all default on), `adult_content_opt_in` (default off), `top_fans_opt_out` (default off), `broadcast_unsubscribed` (default off), `broadcast_unsub_token`.
- `boards`: `is_adult` (default off), `top_fans_public` (default off).
- `completion_reactions`: table rebuilt to widen its reaction-kind constraint from `('upvote','pin')` to `('like','dislike','laugh','pin')`; every existing "upvote" row is carried over as "like" automatically, no data lost.
- New tables: `notifications`, `admin_audit_log`, `broadcast_emails`.

No existing data is altered destructively anywhere in this list; a deploy is the only step required.

## Manual steps

- **Email (SMTP)**: the Phase 6 broadcast feature sends through the same `emailer.ts` used for password resets. If SMTP env vars aren't set in production, broadcast sends (like password-reset emails already did) just log to the server console instead of actually sending. Set real SMTP credentials before relying on Broadcast.
- **Push (VAPID)**: no change from v1's existing requirement; Phase 4 only adds preference gating in front of the push send that was already there.
- **Admin access**: the new Broadcast and Audit Log tabs sit behind the existing `ADMIN_USERNAMES` env var and admin role, nothing new to configure there.
- No new required environment variables were introduced by this release.

## Final notes: anything not completed or done differently

- **Phase 5.1 (adult content)**: the brief's "hidden from users who are not verified adults" has no age-verification mechanism to hook into anywhere in this codebase, and building one is out of scope for this phase. What's implemented is the one concrete mechanism the brief actually describes: a user-level opt-in (default off). "Verified adult" stays aspirational until there's an age-verification flow to attach it to.
- **Phase 5.2 (Top Fans)**: the ranking is computed across every board a given owner runs (per the brief's "on that owner's boards"), while the public/owner-only display toggle is a per-board setting, since that's the only place in the existing UI with an owner context.
- **Phase 2.2 (scrollable month feed)**: "paginate so long histories stay fast" is handled by lazily rendering additional months client-side (the real cost at this app's scale is rendering many month grids, not the already-lightweight completions payload), rather than adding server-side activity pagination. The brief's "keep completion score and the All Activity filter working per month" is implemented as keeping both exactly where they already were (a single global score, "All Activity" as the page label), since there's no existing notion of a monthly score breakdown to extend.
- **Phase 4 (push)**: handling the browser's `pushsubscriptionchange` event for silent token refresh isn't implemented. The PWA plugin here runs in auto-generated service-worker mode, which doesn't support a custom event handler without switching build modes, a bigger change than this phase calls for. New registrations and explicit logout/delete cleanup are covered; an expired subscription is still cleaned up lazily on its next failed send.
- **Phase 8 (event prompts)**: scoping only, as asked. See `docs/event-prompts-proposal.md`. Nothing from it is built.
- **Ground Rule 4 (no em dashes)**: the final sweep rewrote every em dash found in UI copy, error messages, empty states, an email body, a dev log line, and shareable meta tags (page title, link-preview descriptions, PWA manifest name). Code comments (roughly 300 instances, all pre-existing style, never shown to a user) and `README.md` (developer deployment documentation, not in-app content) were reviewed and deliberately left alone as outside "app language." Three literal em-dash placeholder glyphs in the admin panel's tables (standing in for "no value" in a cell) were swapped for an en dash (–) rather than removed, since that's a visual convention rather than sentence punctuation.
