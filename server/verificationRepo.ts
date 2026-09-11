import { db } from './db.js'

export type VerificationCategory = 'organization' | 'public_figure' | 'other'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface VerificationRequestRow {
  id: string
  account_id: string
  category: VerificationCategory
  links: string
  explanation: string
  status: VerificationStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: number | null
  created_at: number
}

const insertStmt = db.prepare(`
  INSERT INTO verification_requests (id, account_id, category, links, explanation, created_at)
  VALUES (@id, @accountId, @category, @links, @explanation, @createdAt)
`)

const hasPendingStmt = db.prepare(`SELECT 1 FROM verification_requests WHERE account_id = ? AND status = 'pending'`)

const latestForAccountStmt = db.prepare(`
  SELECT * FROM verification_requests WHERE account_id = ? ORDER BY created_at DESC LIMIT 1
`)

export function createVerificationRequest(input: {
  id: string
  accountId: string
  category: VerificationCategory
  links: string
  explanation: string
  createdAt: number
}): void {
  insertStmt.run(input)
}

export function hasPendingVerificationRequest(accountId: string): boolean {
  return Boolean(hasPendingStmt.get(accountId))
}

export function getLatestVerificationRequest(accountId: string): VerificationRequestRow | undefined {
  return latestForAccountStmt.get(accountId) as VerificationRequestRow | undefined
}

// --- Admin side ------------------------------------------------------------

export interface AdminVerificationRequestRow extends VerificationRequestRow {
  requester_username: string | null
  requester_account_type: string | null
  requester_email: string | null
}

const listByStatusStmt = db.prepare(`
  SELECT vr.*, a.username AS requester_username, a.account_type AS requester_account_type, a.email AS requester_email
  FROM verification_requests vr
  JOIN accounts a ON a.id = vr.account_id
  WHERE vr.status = ?
  ORDER BY vr.created_at ASC
  LIMIT ? OFFSET ?
`)

const getByIdStmt = db.prepare(`
  SELECT vr.*, a.username AS requester_username, a.account_type AS requester_account_type, a.email AS requester_email
  FROM verification_requests vr
  JOIN accounts a ON a.id = vr.account_id
  WHERE vr.id = ?
`)

const approveStmt = db.prepare(`
  UPDATE verification_requests SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?
`)
const rejectStmt = db.prepare(`
  UPDATE verification_requests SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?
`)
const setVerifiedStmt = db.prepare('UPDATE accounts SET is_verified = ? WHERE id = ?')

export function adminListVerificationRequests(status: VerificationStatus, limit: number, offset = 0): AdminVerificationRequestRow[] {
  return listByStatusStmt.all(status, limit, offset) as AdminVerificationRequestRow[]
}

export function adminGetVerificationRequest(id: string): AdminVerificationRequestRow | undefined {
  return getByIdStmt.get(id) as AdminVerificationRequestRow | undefined
}

// Approving is the only thing that flips accounts.is_verified on — the
// request row itself is left alone afterward as a permanent record of when
// and why.
export function adminApproveVerificationRequest(id: string, accountId: string, adminId: string, note: string | undefined): void {
  const now = Date.now()
  approveStmt.run(note ?? null, adminId, now, id)
  setVerifiedStmt.run(1, accountId)
}

export function adminRejectVerificationRequest(id: string, adminId: string, note: string | undefined): void {
  rejectStmt.run(note ?? null, adminId, Date.now(), id)
}

// A separate action from rejecting a request — for un-verifying an account
// after the fact (misuse, no longer eligible), independent of any specific
// request in its history.
export function adminRevokeVerification(accountId: string): void {
  setVerifiedStmt.run(0, accountId)
}
