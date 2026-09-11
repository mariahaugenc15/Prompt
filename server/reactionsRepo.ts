import { db } from './db.js'

// completionId is either a completed prompts.id (1:1) or a
// prompt_completions.id (broadcast) — reactions don't need to know which.

const findReaction = db.prepare(
  'SELECT 1 FROM completion_reactions WHERE completion_id = ? AND account_id = ? AND kind = ?',
)
const insertReaction = db.prepare(
  'INSERT INTO completion_reactions (completion_id, account_id, kind, created_at) VALUES (?, ?, ?, ?)',
)
const deleteReaction = db.prepare(
  'DELETE FROM completion_reactions WHERE completion_id = ? AND account_id = ? AND kind = ?',
)
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM completion_reactions WHERE completion_id = ? AND kind = ?')

export function toggleReaction(completionId: string, accountId: string, kind: 'upvote' | 'pin'): void {
  if (findReaction.get(completionId, accountId, kind)) {
    deleteReaction.run(completionId, accountId, kind)
  } else {
    insertReaction.run(completionId, accountId, kind, Date.now())
  }
}

export interface ReactionCounts {
  upvotes: number
  pins: number
  upvotedByMe: boolean
  pinnedByMe: boolean
}

export function reactionCounts(completionId: string, viewerId?: string): ReactionCounts {
  return {
    upvotes: (countStmt.get(completionId, 'upvote') as { n: number }).n,
    pins: (countStmt.get(completionId, 'pin') as { n: number }).n,
    upvotedByMe: viewerId ? Boolean(findReaction.get(completionId, viewerId, 'upvote')) : false,
    pinnedByMe: viewerId ? Boolean(findReaction.get(completionId, viewerId, 'pin')) : false,
  }
}
