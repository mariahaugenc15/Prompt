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
if (!accountColumns.has('auth_token_created_at')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN auth_token_created_at INTEGER`)
}
if (!accountColumns.has('avatar_path')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN avatar_path TEXT`)
}
if (!accountColumns.has('bio')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN bio TEXT`)
}
if (!accountColumns.has('reset_token')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN reset_token TEXT`)
  db.exec(`ALTER TABLE accounts ADD COLUMN reset_token_expires INTEGER`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_reset_token ON accounts(reset_token)`)
}
if (!accountColumns.has('is_deleted')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`)
  db.exec(`ALTER TABLE accounts ADD COLUMN deleted_at INTEGER`)
}
if (!accountColumns.has('is_admin')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`)
}

// Bootstraps the first admin(s) without needing direct DB access: list
// usernames (comma-separated) in ADMIN_USERNAMES and, on every server
// start, each matching account is granted admin. Idempotent and re-run on
// every boot rather than once, so it still works if the account in
// question hasn't signed up yet at deploy time — the next restart after
// they do picks it up. Not reversible from here: removing a username from
// the env var does not revoke access already granted (there's no
// "downgrade" step) — do that by hand via the admin dashboard once one
// exists, or direct DB access.
const adminUsernames = (process.env.ADMIN_USERNAMES ?? '')
  .split(',')
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean)
if (adminUsernames.length > 0) {
  const grantAdmin = db.prepare('UPDATE accounts SET is_admin = 1 WHERE username_normalized = ?')
  for (const username of adminUsernames) grantAdmin.run(username)
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

// Blocking: a one-directional relationship. Blocking someone also breaks any
// existing follow in either direction (enforced in blocksRepo.ts) so a
// blocked account can't keep receiving your activity via a stale follow.
db.exec(`
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_account_id TEXT NOT NULL,
    blocked_account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_account_id, blocked_account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_account_id);
`)

// Reports: a flag on an account, completion (post), board, or comment.
// reporter_email is captured at submission time from the reporter's own
// account (never client-supplied — see moderationRoutes.ts) so the admin
// dashboard can follow up without cross-referencing the accounts table.
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_account_id TEXT NOT NULL,
    reporter_email TEXT,
    target_type TEXT NOT NULL CHECK (target_type IN ('account', 'completion', 'board', 'comment')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolution_note TEXT,
    resolved_by TEXT,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`)

// Defensive migration for a reports table created before this pass: add
// the new nullable columns in place, but the target_type CHECK constraint
// (which didn't allow 'comment') can only be widened by rebuilding the
// table — SQLite has no ALTER TABLE for constraints. Only a handful of
// rows ever exist here, so a rename-copy-drop is cheap and safe.
const reportsTableSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reports'`).get() as
  | { sql: string }
  | undefined)?.sql
if (reportsTableSql && !reportsTableSql.includes("'comment'")) {
  db.exec(`
    ALTER TABLE reports RENAME TO reports_old;
    CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      reporter_account_id TEXT NOT NULL,
      reporter_email TEXT,
      target_type TEXT NOT NULL CHECK (target_type IN ('account', 'completion', 'board', 'comment')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      resolution_note TEXT,
      resolved_by TEXT,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );
    INSERT INTO reports (id, reporter_account_id, target_type, target_id, reason, created_at)
      SELECT id, reporter_account_id, target_type, target_id, reason, created_at FROM reports_old;
    DROP TABLE reports_old;
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  `)
}
const reportColumns = new Set((db.prepare('PRAGMA table_info(reports)').all() as { name: string }[]).map((c) => c.name))
if (!reportColumns.has('reporter_email')) {
  db.exec(`ALTER TABLE reports ADD COLUMN reporter_email TEXT`)
}
if (!reportColumns.has('status')) {
  db.exec(`ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`)
  db.exec(`ALTER TABLE reports ADD COLUMN resolution_note TEXT`)
  db.exec(`ALTER TABLE reports ADD COLUMN resolved_by TEXT`)
  db.exec(`ALTER TABLE reports ADD COLUMN resolved_at INTEGER`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`)
}

// Feedback: open-ended, not tied to any specific post/account — a direct
// line to the people running the app, same resolve workflow as a report.
// email is captured the same way (from the account, not client-supplied).
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolution_note TEXT,
    resolved_by TEXT,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
`)

// Comments on a completion (post). Soft-deleted (is_removed) rather than
// hard-deleted so a moderation action leaves an audit trail — removed_by
// is an admin account id when an admin removed it, NULL when the author
// deleted their own.
db.exec(`
  CREATE TABLE IF NOT EXISTS completion_comments (
    id TEXT PRIMARY KEY,
    completion_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    text TEXT NOT NULL,
    is_removed INTEGER NOT NULL DEFAULT 0,
    removed_by TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_completion_comments_completion ON completion_comments(completion_id);
`)

// One row per (account, calendar day) the account made an authenticated
// request on — the basis for the admin dashboard's active-user metrics
// (server/adminRepo.ts). "Active" is tracked as any authenticated activity,
// not just a fresh login: a session token is valid for up to 90 days
// without needing to log in again (see server/auth.ts), so counting logins
// alone would badly undercount someone using the app daily on a session
// they signed into weeks ago — activity is the metric that actually
// reflects engagement. INSERT OR IGNORE keeps recording it idempotent (and
// cheap) no matter how many requests a account makes in a day. There's no
// history before this table was added, so day-over-day metrics only start
// counting from whenever this shipped.
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_days (
    account_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    PRIMARY KEY (account_id, activity_date)
  );
  CREATE INDEX IF NOT EXISTS idx_activity_days_date ON activity_days(activity_date);
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
