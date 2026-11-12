import crypto from 'node:crypto'
import { db } from './db.js'
import { canViewCompletion } from './completionsRepo.js'

export const STAMP_CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug'] as const
export type StampCategory = (typeof STAMP_CATEGORIES)[number]

interface StampDefinitionRow {
  id: string
  category: StampCategory
}

// Only one definition per category exists today (season = ''), but a
// future seasonal set means this can return more than one row per
// category — award always targets the evergreen one, never a seasonal
// one, since nothing here decides which season is "current."
const getDefaultDefinitionStmt = db.prepare(
  `SELECT id, category FROM stamp_definitions WHERE category = ? AND season = ''`,
)

const insertUserStamp = db.prepare(`
  INSERT INTO user_stamps (id, account_id, stamp_definition_id, completion_id, earned_at)
  VALUES (@id, @accountId, @stampDefinitionId, @completionId, @earnedAt)
  ON CONFLICT(account_id, completion_id, stamp_definition_id) DO NOTHING
`)

// The one place a stamp is ever created. Called by the server right after
// a completion is recorded (server/promptRoutes.ts) — category comes from
// the prompt's own row, never from the request body, so there's nothing
// here a client could spoof to earn a stamp it didn't complete or pick
// which category it gets. Idempotent: the UNIQUE constraint on user_stamps
// (account_id, completion_id, stamp_definition_id) plus ON CONFLICT DO
// NOTHING means calling this twice for the same completion — a retried
// request, the one-time backfill migration re-running on a later boot —
// never awards a second stamp.
export function awardStamp(accountId: string, completionId: string, category: string): void {
  const definition = getDefaultDefinitionStmt.get(category) as StampDefinitionRow | undefined
  if (!definition) return
  insertUserStamp.run({
    id: crypto.randomUUID(),
    accountId,
    stampDefinitionId: definition.id,
    completionId,
    earnedAt: Date.now(),
  })
}

export interface StampBookEntry {
  category: StampCategory
  count: number
  earned: boolean
}

interface VisibleStampRow {
  completion_id: string
  category: StampCategory
}

const stampsForAccountStmt = db.prepare(`
  SELECT us.completion_id, sd.category
  FROM user_stamps us
  JOIN stamp_definitions sd ON sd.id = us.stamp_definition_id
  WHERE us.account_id = ?
`)

// Someone viewing another user's calendar only sees stamps for
// completions they're actually allowed to see — reusing
// completionsRepo.ts's canViewCompletion (the same per-completion
// visibility gate Phase 3 built for comments/reactions) rather than
// re-deriving that logic here, so a private 1:1 completion's stamp never
// shows up in a stranger's view of someone's Stamps book even though the
// stamp itself has no visibility of its own.
export function getStampBook(targetAccountId: string, viewerId: string | undefined): StampBookEntry[] {
  const rows = stampsForAccountStmt.all(targetAccountId) as VisibleStampRow[]
  const counts = new Map<StampCategory, number>()
  for (const row of rows) {
    if (!canViewCompletion(row.completion_id, viewerId)) continue
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }
  return STAMP_CATEGORIES.map((category) => {
    const count = counts.get(category) ?? 0
    return { category, count, earned: count > 0 }
  })
}
