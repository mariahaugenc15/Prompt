import { db } from './db.js'

// completionId is either a completed prompts.id (1:1) or a
// prompt_completions.id (broadcast) — reactions don't need to know which.

export type ExclusiveReactionKind = 'like' | 'dislike' | 'laugh'
export type ReactionKind = ExclusiveReactionKind | 'pin'

const EXCLUSIVE_KINDS: ExclusiveReactionKind[] = ['like', 'dislike', 'laugh']

const findReaction = db.prepare(
  'SELECT 1 FROM completion_reactions WHERE completion_id = ? AND account_id = ? AND kind = ?',
)
const insertReaction = db.prepare(
  'INSERT INTO completion_reactions (completion_id, account_id, kind, created_at) VALUES (?, ?, ?, ?)',
)
const deleteReaction = db.prepare(
  'DELETE FROM completion_reactions WHERE completion_id = ? AND account_id = ? AND kind = ?',
)
const deleteExclusiveReactions = db.prepare(
  `DELETE FROM completion_reactions WHERE completion_id = ? AND account_id = ? AND kind IN ('like', 'dislike', 'laugh')`,
)
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM completion_reactions WHERE completion_id = ? AND kind = ?')

// like/dislike/laugh are mutually exclusive — one reaction per user per
// item, picking a different one swaps it rather than stacking. Tapping
// your current one again removes it. "pin" is a separate bookmark concept
// and keeps its own independent on/off toggle, unaffected by any of this.
export function toggleReaction(completionId: string, accountId: string, kind: ReactionKind): void {
  if (kind === 'pin') {
    if (findReaction.get(completionId, accountId, 'pin')) {
      deleteReaction.run(completionId, accountId, 'pin')
    } else {
      insertReaction.run(completionId, accountId, 'pin', Date.now())
    }
    return
  }

  const alreadySet = findReaction.get(completionId, accountId, kind)
  deleteExclusiveReactions.run(completionId, accountId)
  if (!alreadySet) {
    insertReaction.run(completionId, accountId, kind, Date.now())
  }
}

export interface ReactionCounts {
  likes: number
  dislikes: number
  laughs: number
  pins: number
  myReaction: ExclusiveReactionKind | null
  pinnedByMe: boolean
}

function myExclusiveReaction(completionId: string, viewerId?: string): ExclusiveReactionKind | null {
  if (!viewerId) return null
  for (const kind of EXCLUSIVE_KINDS) {
    if (findReaction.get(completionId, viewerId, kind)) return kind
  }
  return null
}

export function reactionCounts(completionId: string, viewerId?: string): ReactionCounts {
  return {
    likes: (countStmt.get(completionId, 'like') as { n: number }).n,
    dislikes: (countStmt.get(completionId, 'dislike') as { n: number }).n,
    laughs: (countStmt.get(completionId, 'laugh') as { n: number }).n,
    pins: (countStmt.get(completionId, 'pin') as { n: number }).n,
    myReaction: myExclusiveReaction(completionId, viewerId),
    pinnedByMe: viewerId ? Boolean(findReaction.get(completionId, viewerId, 'pin')) : false,
  }
}
