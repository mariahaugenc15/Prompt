import crypto from 'node:crypto'
import { db } from './db.js'
import { deactivateAccount, permanentlyDeleteAccount } from './accountsRepo.js'

// Admin-facing account view — includes fields the normal-user
// accountsRepo.ts queries deliberately leave out (is_admin, is_deleted,
// created_at, raw email) since those aren't anyone's business but an
// admin's. The engagement counts (resolved_one_to_one etc.) are the raw
// inputs to the same completion-score formula feedRoutes.ts uses for
// /api/me/completion-score — computed here per-row via subqueries rather
// than N+1 queries, then turned into a score in JS below.
export interface AdminAccountRow {
  id: string
  account_type: string
  username: string
  email: string
  first_name: string | null
  organization_name: string | null
  is_admin: number
  is_deleted: number
  is_verified: number
  totp_enabled: number
  created_at: number
  last_active_date: string | null
  resolved_one_to_one: number
  completed_one_to_one: number
  broadcasts_completed: number
  prompts_sent: number
  follower_count: number
  completion_score: number | null
  completion_completed: number
  completion_total: number
}

const ADMIN_ACCOUNT_COLUMNS = `
  a.id, a.account_type, a.username, a.email, a.first_name, a.organization_name,
  a.is_admin, a.is_deleted, a.is_verified, a.totp_enabled, a.created_at,
  (SELECT MAX(ad.activity_date) FROM activity_days ad WHERE ad.account_id = a.id) AS last_active_date,
  (SELECT COUNT(*) FROM prompts p WHERE p.is_broadcast = 0 AND p.recipient_account_id = a.id AND p.status IN ('completed', 'declined', 'expired')) AS resolved_one_to_one,
  (SELECT COUNT(*) FROM prompts p WHERE p.is_broadcast = 0 AND p.recipient_account_id = a.id AND p.status = 'completed') AS completed_one_to_one,
  (SELECT COUNT(*) FROM prompt_completions pc WHERE pc.completer_account_id = a.id) AS broadcasts_completed,
  (SELECT COUNT(*) FROM prompts p WHERE p.sender_account_id = a.id) AS prompts_sent,
  (SELECT COUNT(*) FROM follows f WHERE f.followee_account_id = a.id) AS follower_count
`

function withScore(row: Omit<AdminAccountRow, 'completion_score' | 'completion_completed' | 'completion_total'>): AdminAccountRow {
  const completed = row.completed_one_to_one + row.broadcasts_completed
  const total = row.resolved_one_to_one + row.broadcasts_completed
  return { ...row, completion_completed: completed, completion_total: total, completion_score: total === 0 ? null : Math.round((completed / total) * 100) }
}

const accountTypeFilterSql = (accountType?: string) => (accountType === 'individual' || accountType === 'organization' ? ' AND a.account_type = ?' : '')

const listAccountsStmt = (accountType?: string) =>
  db.prepare(`
    SELECT ${ADMIN_ACCOUNT_COLUMNS}
    FROM accounts a
    WHERE 1=1${accountTypeFilterSql(accountType)}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `)

const searchAccountsStmt = (accountType?: string) =>
  db.prepare(`
    SELECT ${ADMIN_ACCOUNT_COLUMNS}
    FROM accounts a
    WHERE (a.username_normalized LIKE ? ESCAPE '\\' OR a.email_normalized LIKE ? ESCAPE '\\')${accountTypeFilterSql(accountType)}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `)

const getAccountStmt = db.prepare(`
  SELECT ${ADMIN_ACCOUNT_COLUMNS}
  FROM accounts a WHERE a.id = ?
`)

const allAccountsStmt = (accountType?: string) =>
  db.prepare(`
    SELECT ${ADMIN_ACCOUNT_COLUMNS}
    FROM accounts a
    WHERE 1=1${accountTypeFilterSql(accountType)}
    ORDER BY a.created_at DESC
  `)

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}

export function adminListAccounts(limit: number, offset = 0, accountType?: string): AdminAccountRow[] {
  const args = accountType === 'individual' || accountType === 'organization' ? [accountType, limit, offset] : [limit, offset]
  return (listAccountsStmt(accountType).all(...args) as Omit<AdminAccountRow, 'completion_score' | 'completion_completed' | 'completion_total'>[]).map(withScore)
}

export function adminSearchAccounts(query: string, limit: number, offset = 0, accountType?: string): AdminAccountRow[] {
  const like = `%${escapeLike(query.trim().toLowerCase())}%`
  const args =
    accountType === 'individual' || accountType === 'organization' ? [like, like, accountType, limit, offset] : [like, like, limit, offset]
  return (searchAccountsStmt(accountType).all(...args) as Omit<AdminAccountRow, 'completion_score' | 'completion_completed' | 'completion_total'>[]).map(withScore)
}

export function adminGetAccount(id: string): AdminAccountRow | undefined {
  const row = getAccountStmt.get(id) as Omit<AdminAccountRow, 'completion_score' | 'completion_completed' | 'completion_total'> | undefined
  return row ? withScore(row) : undefined
}

// Unpaginated — backs the CSV export, which needs every matching row in one
// pass rather than a page at a time.
export function adminAllAccounts(accountType?: string): AdminAccountRow[] {
  const args = accountType === 'individual' || accountType === 'organization' ? [accountType] : []
  return (allAccountsStmt(accountType).all(...args) as Omit<AdminAccountRow, 'completion_score' | 'completion_completed' | 'completion_total'>[]).map(withScore)
}

// Banning is the same anonymize-and-lock operation a self-delete performs
// (accountsRepo.ts) — there's no separate "banned" state, just deactivated,
// same as if the person had deleted their own account.
export function adminBanAccount(id: string): void {
  deactivateAccount(id)
}

// Permanent delete — see accountsRepo.ts's permanentlyDeleteAccount for
// exactly what this does and doesn't remove. Separate and irreversible,
// unlike Ban above.
export function adminDeleteAccount(id: string): void {
  permanentlyDeleteAccount(id)
}

// --- Reports -----------------------------------------------------------

export interface ReportRow {
  id: string
  reporter_account_id: string
  reporter_email: string | null
  target_type: string
  target_id: string
  reason: string
  status: string
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: number | null
  created_at: number
  reporter_username: string | null
}

const listReportsStmt = db.prepare(`
  SELECT r.*, a.username AS reporter_username
  FROM reports r LEFT JOIN accounts a ON a.id = r.reporter_account_id
  WHERE r.status = ?
  ORDER BY r.created_at DESC
  LIMIT ? OFFSET ?
`)

const getReportStmt = db.prepare(`
  SELECT r.*, a.username AS reporter_username
  FROM reports r LEFT JOIN accounts a ON a.id = r.reporter_account_id
  WHERE r.id = ?
`)

const resolveReportStmt = db.prepare(`
  UPDATE reports SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?
`)

const reopenReportStmt = db.prepare(`
  UPDATE reports SET status = 'open', resolution_note = NULL, resolved_by = NULL, resolved_at = NULL WHERE id = ?
`)

export function adminListReports(status: 'open' | 'resolved', limit: number, offset = 0): ReportRow[] {
  return listReportsStmt.all(status, limit, offset) as ReportRow[]
}

export function adminGetReport(id: string): ReportRow | undefined {
  return getReportStmt.get(id) as ReportRow | undefined
}

export function adminResolveReport(id: string, resolvedBy: string, note: string | undefined): void {
  resolveReportStmt.run(note ?? null, resolvedBy, Date.now(), id)
}

export function adminReopenReport(id: string): void {
  reopenReportStmt.run(id)
}

// --- Feedback ------------------------------------------------------------

export interface FeedbackRow {
  id: string
  account_id: string
  email: string
  message: string
  status: string
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: number | null
  created_at: number
  author_username: string | null
}

const listFeedbackStmt = db.prepare(`
  SELECT f.*, a.username AS author_username
  FROM feedback f LEFT JOIN accounts a ON a.id = f.account_id
  WHERE f.status = ?
  ORDER BY f.created_at DESC
  LIMIT ? OFFSET ?
`)

const resolveFeedbackStmt = db.prepare(`
  UPDATE feedback SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ?
`)

const reopenFeedbackStmt = db.prepare(`
  UPDATE feedback SET status = 'open', resolution_note = NULL, resolved_by = NULL, resolved_at = NULL WHERE id = ?
`)

export function adminListFeedback(status: 'open' | 'resolved', limit: number, offset = 0): FeedbackRow[] {
  return listFeedbackStmt.all(status, limit, offset) as FeedbackRow[]
}

export function adminResolveFeedback(id: string, resolvedBy: string, note: string | undefined): void {
  resolveFeedbackStmt.run(note ?? null, resolvedBy, Date.now(), id)
}

export function adminReopenFeedback(id: string): void {
  reopenFeedbackStmt.run(id)
}

// --- Comments (moderation view — includes removed ones for audit) --------

export interface AdminCommentRow {
  id: string
  completion_id: string
  account_id: string
  text: string
  is_removed: number
  removed_by: string | null
  created_at: number
  author_username: string | null
}

const listCommentsStmt = db.prepare(`
  SELECT c.*, a.username AS author_username
  FROM completion_comments c LEFT JOIN accounts a ON a.id = c.account_id
  ORDER BY c.created_at DESC
  LIMIT ? OFFSET ?
`)

const getCommentStmt = db.prepare(`
  SELECT c.*, a.username AS author_username
  FROM completion_comments c LEFT JOIN accounts a ON a.id = c.account_id
  WHERE c.id = ?
`)

export function adminListComments(limit: number, offset = 0): AdminCommentRow[] {
  return listCommentsStmt.all(limit, offset) as AdminCommentRow[]
}

export function adminGetComment(id: string): AdminCommentRow | undefined {
  return getCommentStmt.get(id) as AdminCommentRow | undefined
}

// --- Usage stats -----------------------------------------------------------
// Backs the dashboard's Overview tab. "Active" is any authenticated request
// (server/activityRepo.ts), not just a fresh login — see db.ts's
// activity_days comment for why. There's no activity history before that
// table shipped, so these are only meaningful from then on.

export interface UsageStats {
  allTimeUsers: number
  deactivatedUsers: number
  monthlyActiveUsers: number
  dailyActiveUsersToday: number
  avgDailyActiveUsers30d: number
}

const allTimeUsersStmt = db.prepare('SELECT COUNT(*) AS n FROM accounts')
const deactivatedUsersStmt = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE is_deleted = 1')

// Distinct accounts with at least one recorded activity day in the last 30
// days — the standard "monthly active users" definition (any activity in
// the trailing window), joined against accounts so a banned/deleted
// account's stale activity rows don't inflate the count.
const monthlyActiveUsersStmt = db.prepare(`
  SELECT COUNT(DISTINCT ad.account_id) AS n
  FROM activity_days ad
  JOIN accounts a ON a.id = ad.account_id AND a.is_deleted = 0
  WHERE ad.activity_date >= date('now', '-30 days')
`)

const dailyActiveUsersTodayStmt = db.prepare(`
  SELECT COUNT(DISTINCT ad.account_id) AS n
  FROM activity_days ad
  JOIN accounts a ON a.id = ad.account_id AND a.is_deleted = 0
  WHERE ad.activity_date = date('now')
`)

// Average of each day's distinct active-account count over the last 30
// days — "daily average use," as opposed to just today's snapshot, which
// can swing a lot day to day for a small user base.
const avgDailyActiveUsers30dStmt = db.prepare(`
  SELECT AVG(cnt) AS avg FROM (
    SELECT COUNT(DISTINCT ad.account_id) AS cnt
    FROM activity_days ad
    JOIN accounts a ON a.id = ad.account_id AND a.is_deleted = 0
    WHERE ad.activity_date >= date('now', '-30 days')
    GROUP BY ad.activity_date
  )
`)

export function adminUsageStats(): UsageStats {
  return {
    allTimeUsers: (allTimeUsersStmt.get() as { n: number }).n,
    deactivatedUsers: (deactivatedUsersStmt.get() as { n: number }).n,
    monthlyActiveUsers: (monthlyActiveUsersStmt.get() as { n: number }).n,
    dailyActiveUsersToday: (dailyActiveUsersTodayStmt.get() as { n: number }).n,
    avgDailyActiveUsers30d: (avgDailyActiveUsers30dStmt.get() as { avg: number | null }).avg ?? 0,
  }
}

// --- Audit log -------------------------------------------------------------
// One row per sensitive admin action (permanent delete, email export,
// broadcast send/test) — who, whom (if applicable), when, and a short
// human-readable detail string. Independent of every other table so it
// outlives even a permanently-deleted target account.

export interface AuditLogRow {
  id: string
  admin_account_id: string
  action: string
  target_account_id: string | null
  details: string | null
  created_at: number
  admin_username: string | null
  target_username: string | null
}

const insertAuditLog = db.prepare(`
  INSERT INTO admin_audit_log (id, admin_account_id, action, target_account_id, details, created_at)
  VALUES (@id, @adminAccountId, @action, @targetAccountId, @details, @createdAt)
`)

export function recordAuditLog(input: { adminAccountId: string; action: string; targetAccountId?: string; details?: string }): void {
  insertAuditLog.run({
    id: crypto.randomUUID(),
    adminAccountId: input.adminAccountId,
    action: input.action,
    targetAccountId: input.targetAccountId ?? null,
    details: input.details ?? null,
    createdAt: Date.now(),
  })
}

const listAuditLogStmt = db.prepare(`
  SELECT l.*, admin.username AS admin_username, target.username AS target_username
  FROM admin_audit_log l
  LEFT JOIN accounts admin ON admin.id = l.admin_account_id
  LEFT JOIN accounts target ON target.id = l.target_account_id
  ORDER BY l.created_at DESC
  LIMIT ? OFFSET ?
`)

export function listAuditLog(limit: number, offset = 0): AuditLogRow[] {
  return listAuditLogStmt.all(limit, offset) as AuditLogRow[]
}

// --- Broadcast email (admin "contact all users") ---------------------------

const getUnsubTokenStmt = db.prepare('SELECT broadcast_unsub_token FROM accounts WHERE id = ?')
const setUnsubTokenStmt = db.prepare('UPDATE accounts SET broadcast_unsub_token = ? WHERE id = ?')

// Generated lazily (on first broadcast) rather than at signup, so the
// column stays empty for every account until it's actually needed.
export function ensureBroadcastUnsubToken(accountId: string): string {
  const existing = (getUnsubTokenStmt.get(accountId) as { broadcast_unsub_token: string | null } | undefined)
    ?.broadcast_unsub_token
  if (existing) return existing
  const token = crypto.randomBytes(24).toString('hex')
  setUnsubTokenStmt.run(token, accountId)
  return token
}

const findByUnsubTokenStmt = db.prepare('SELECT id FROM accounts WHERE broadcast_unsub_token = ?')
const setUnsubscribedStmt = db.prepare('UPDATE accounts SET broadcast_unsubscribed = 1 WHERE id = ?')

// Returns the account id unsubscribed, or undefined for an unknown/already-
// consumed token — the route treats either the same way (a quiet no-op
// success page, never an error that would leak whether a token was valid).
export function unsubscribeByToken(token: string): string | undefined {
  const row = findByUnsubTokenStmt.get(token) as { id: string } | undefined
  if (!row) return undefined
  setUnsubscribedStmt.run(row.id)
  return row.id
}

export interface BroadcastRecipient {
  id: string
  email: string
  username: string
}

// Every non-deleted, non-unsubscribed account — "contact all users" per the
// brief. Notification preferences (notify_*, Phase 4) govern push/in-app
// notifications, a different channel, so they're not consulted here;
// broadcast_unsubscribed is this channel's own opt-out.
const listRecipientsStmt = db.prepare(`
  SELECT id, email, username FROM accounts WHERE is_deleted = 0 AND broadcast_unsubscribed = 0
`)

export function listBroadcastRecipients(): BroadcastRecipient[] {
  return listRecipientsStmt.all() as BroadcastRecipient[]
}

export interface BroadcastEmailRow {
  id: string
  sent_by: string
  subject: string
  body: string
  recipient_count: number
  created_at: number
  sent_by_username: string | null
}

const insertBroadcastEmail = db.prepare(`
  INSERT INTO broadcast_emails (id, sent_by, subject, body, recipient_count, created_at)
  VALUES (@id, @sentBy, @subject, @body, @recipientCount, @createdAt)
`)

export function recordBroadcastEmail(input: { sentBy: string; subject: string; body: string; recipientCount: number }): string {
  const id = crypto.randomUUID()
  insertBroadcastEmail.run({ id, ...input, createdAt: Date.now() })
  return id
}

const listBroadcastEmailsStmt = db.prepare(`
  SELECT b.*, a.username AS sent_by_username
  FROM broadcast_emails b LEFT JOIN accounts a ON a.id = b.sent_by
  ORDER BY b.created_at DESC
  LIMIT ? OFFSET ?
`)

export function listBroadcastEmails(limit: number, offset = 0): BroadcastEmailRow[] {
  return listBroadcastEmailsStmt.all(limit, offset) as BroadcastEmailRow[]
}
