import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

// Local dev: a folder next to this file. In production this must point at
// a mounted persistent disk (e.g. Render disk, Fly volume, Railway volume)
// via the DATA_DIR env var — without it, a host with an ephemeral
// filesystem silently loses every account on the next deploy or restart.
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'server', '.data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(path.join(dataDir, 'prompt.sqlite'))
db.pragma('journal_mode = WAL')

// Usernames are shared across individual and organization accounts (one
// namespace), and both username and email are enforced unique at the
// database level via a unique index on a lowercase-normalized column —
// this is the actual constraint, not just an application-level check.
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_type TEXT NOT NULL CHECK (account_type IN ('individual', 'organization')),
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    first_name TEXT,
    organization_name TEXT,
    website_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_normalized ON accounts(username_normalized);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_normalized ON accounts(email_normalized);
`)

// Defensive migration for anyone with a pre-existing local accounts table
// from before the prompt-loop feature: add the new columns if missing
// rather than assuming a fresh CREATE TABLE ran.
const accountColumns = new Set((db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[]).map((c) => c.name))
if (!accountColumns.has('prompt_permission')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN prompt_permission TEXT NOT NULL DEFAULT 'mutuals'`)
}
if (!accountColumns.has('auth_token')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN auth_token TEXT`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_auth_token ON accounts(auth_token)`)
}

// One row per follow relationship. Organizations never appear as the
// follower (enforced in server/permissions.ts, not here) — they don't
// follow anything, only broadcast.
db.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    follower_account_id TEXT NOT NULL,
    followee_account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_account_id, followee_account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_account_id);
`)

// A single "prompts" table covers both shapes described in the spec:
//  - 1:1 (is_broadcast = 0): recipient_account_id is set, and the prompt's
//    own status/completion_* columns carry the outcome directly.
//  - broadcast (is_broadcast = 1): recipient_account_id is NULL, the row
//    is a template ("active" until the sender closes it out, though v1
//    doesn't expose closing it), and each follower's completion is its
//    own row in prompt_completions — never duplicated as separate prompts
//    per follower.
db.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    sender_account_id TEXT NOT NULL,
    recipient_account_id TEXT,
    is_broadcast INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'declined', 'expired', 'active')),
    completion_media_type TEXT,
    completion_media_data_url TEXT,
    completion_auto_caption TEXT,
    completion_user_caption TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_prompts_recipient ON prompts(recipient_account_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_sender ON prompts(sender_account_id);

  CREATE TABLE IF NOT EXISTS prompt_completions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    completer_account_id TEXT NOT NULL,
    media_type TEXT,
    media_data_url TEXT,
    auto_caption TEXT NOT NULL,
    user_caption TEXT,
    created_at INTEGER NOT NULL
  );
  -- A follower can only complete a given broadcast once.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_completions_prompt_completer ON prompt_completions(prompt_id, completer_account_id);
`)

// A broadcast can now originate from a board instead of (or in addition to)
// being sent by an organization account — same fan-out-to-subscribers
// mechanic, just gated by board membership instead of a follow. cadence is
// display-only (v1 has no scheduler that actually re-fires a challenge).
const promptColumns = new Set((db.prepare('PRAGMA table_info(prompts)').all() as { name: string }[]).map((c) => c.name))
if (!promptColumns.has('board_id')) {
  db.exec(`ALTER TABLE prompts ADD COLUMN board_id TEXT`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompts_board ON prompts(board_id)`)
}
if (!promptColumns.has('cadence')) {
  db.exec(`ALTER TABLE prompts ADD COLUMN cadence TEXT`)
}

// Boards: a named public/private group any real account can create, find,
// and join — the server-backed record of a board's existence and
// membership so a public one is genuinely discoverable by anyone on the
// app, not just visible on the creator's own device.
db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'invite')),
    location_tag TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_boards_visibility ON boards(visibility);
  CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_account_id);

  CREATE TABLE IF NOT EXISTS board_subscribers (
    board_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (board_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_board_subscribers_account ON board_subscribers(account_id);
`)

const boardColumns = new Set((db.prepare('PRAGMA table_info(boards)').all() as { name: string }[]).map((c) => c.name))
if (!boardColumns.has('icon')) {
  db.exec(`ALTER TABLE boards ADD COLUMN icon TEXT`)
}

// Calendars: a named, optionally-shared filter over your own completions.
// Joining a public calendar doesn't grant you anyone else's completions —
// it just means whatever any member tags into it shows up merged there.
db.exec(`
  CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calendars_visibility ON calendars(visibility);

  CREATE TABLE IF NOT EXISTS calendar_members (
    calendar_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (calendar_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_members_account ON calendar_members(account_id);

  -- completion_id is either a prompts.id (a completed 1:1 prompt) or a
  -- prompt_completions.id (a completed broadcast) — the two completion
  -- shapes share this one tagging table rather than needing two.
  CREATE TABLE IF NOT EXISTS completion_calendars (
    completion_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    PRIMARY KEY (completion_id, calendar_id)
  );
  CREATE INDEX IF NOT EXISTS idx_completion_calendars_calendar ON completion_calendars(calendar_id);
`)

// Reactions on a completion (same dual completion-id space as above).
db.exec(`
  CREATE TABLE IF NOT EXISTS completion_reactions (
    completion_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('upvote', 'pin')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (completion_id, account_id, kind)
  );
`)

// Web Push subscriptions — lets a notification reach a device even when the
// app itself isn't open, unlike the in-page Notification API used until now.
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account ON push_subscriptions(account_id);
`)
