import crypto from 'node:crypto'
import { db } from './db.js'

// The hand-off between "password checked out" and "TOTP code checked out"
// during login for a 2FA-enabled account — see db.ts's pending_logins
// comment for why this is a DB row rather than a signed token.
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000

const insertStmt = db.prepare('INSERT INTO pending_logins (id, account_id, created_at) VALUES (?, ?, ?)')
const getStmt = db.prepare('SELECT account_id, created_at FROM pending_logins WHERE id = ?')
const deleteStmt = db.prepare('DELETE FROM pending_logins WHERE id = ?')
const deleteExpiredStmt = db.prepare('DELETE FROM pending_logins WHERE created_at < ?')

export function createPendingLogin(accountId: string): string {
  deleteExpiredStmt.run(Date.now() - PENDING_LOGIN_TTL_MS)
  const id = crypto.randomBytes(32).toString('hex')
  insertStmt.run(id, accountId, Date.now())
  return id
}

// Deliberately does not delete the row on failure — the client is expected
// to retry with a different code within the same TTL window, gated by the
// same authLimiter as /api/login itself.
export function peekPendingLogin(loginToken: string): { accountId: string } | undefined {
  const row = getStmt.get(loginToken) as { account_id: string; created_at: number } | undefined
  if (!row || Date.now() - row.created_at > PENDING_LOGIN_TTL_MS) return undefined
  return { accountId: row.account_id }
}

export function consumePendingLogin(loginToken: string): void {
  deleteStmt.run(loginToken)
}
