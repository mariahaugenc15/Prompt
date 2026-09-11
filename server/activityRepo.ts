import { db } from './db.js'

// Recorded from server/auth.ts on every authenticated request (both
// requireAuth and resolveOptionalAccountId) — see activity_days in db.ts
// for why activity, not login events, is the signal.
const recordStmt = db.prepare(`
  INSERT OR IGNORE INTO activity_days (account_id, activity_date) VALUES (?, date('now'))
`)

export function recordActivity(accountId: string): void {
  recordStmt.run(accountId)
}
