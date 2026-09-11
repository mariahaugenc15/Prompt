import { db } from './db.js'

const insertBlock = db.prepare(
  'INSERT OR IGNORE INTO blocks (blocker_account_id, blocked_account_id, created_at) VALUES (?, ?, ?)',
)
const deleteBlock = db.prepare('DELETE FROM blocks WHERE blocker_account_id = ? AND blocked_account_id = ?')
const deleteFollowBothWays = db.prepare(`
  DELETE FROM follows
  WHERE (follower_account_id = ? AND followee_account_id = ?)
     OR (follower_account_id = ? AND followee_account_id = ?)
`)
const blockedByMeStmt = db.prepare('SELECT blocked_account_id AS id FROM blocks WHERE blocker_account_id = ?')
const directionStmt = db.prepare('SELECT 1 FROM blocks WHERE blocker_account_id = ? AND blocked_account_id = ?')
const eitherWayStmt = db.prepare(`
  SELECT 1 FROM blocks
  WHERE (blocker_account_id = ? AND blocked_account_id = ?)
     OR (blocker_account_id = ? AND blocked_account_id = ?)
`)
const allInvolvingStmt = db.prepare(`
  SELECT blocker_account_id, blocked_account_id FROM blocks
  WHERE blocker_account_id = ? OR blocked_account_id = ?
`)

// Blocking is unilateral, but it also severs any existing follow in either
// direction — otherwise the blocked account could keep showing up in the
// blocker's following feed (or vice versa) via a follow relationship that
// predates the block.
export function block(blockerId: string, blockedId: string): void {
  insertBlock.run(blockerId, blockedId, Date.now())
  deleteFollowBothWays.run(blockerId, blockedId, blockedId, blockerId)
}

export function unblock(blockerId: string, blockedId: string): void {
  deleteBlock.run(blockerId, blockedId)
}

export function blockedByMe(accountId: string): string[] {
  return (blockedByMeStmt.all(accountId) as { id: string }[]).map((r) => r.id)
}

// Directional: did `viewerId` specifically block `targetId`? Distinct from
// isBlockedEitherWay below — this is what decides whether a profile's
// Block button should read "Block" or "Unblock".
export function isBlockedByViewer(viewerId: string, targetId: string): boolean {
  return Boolean(directionStmt.get(viewerId, targetId))
}

// Used to gate any interaction between two specific accounts (sending a
// prompt, following) — a block in *either* direction should stop it, not
// just the direction the blocker initiated.
export function isBlockedEitherWay(a: string, b: string): boolean {
  return Boolean(eitherWayStmt.get(a, b, b, a))
}

// Every account id that has any block relationship (either direction) with
// this account — used to filter that account's own search/discover/
// suggestions lists so a blocked relationship doesn't keep surfacing either
// party to the other.
export function blockedEitherWayIds(accountId: string): Set<string> {
  const rows = allInvolvingStmt.all(accountId, accountId) as { blocker_account_id: string; blocked_account_id: string }[]
  const ids = new Set<string>()
  for (const row of rows) {
    ids.add(row.blocker_account_id === accountId ? row.blocked_account_id : row.blocker_account_id)
  }
  return ids
}
