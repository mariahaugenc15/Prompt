import type { DarePrompt } from './types'

/**
 * Only friend dares actually received count — board broadcasts and feed
 * browsing never factor in. A dare still pending or accepted-but-in-progress
 * doesn't count against the score yet (the user hasn't had a chance to act);
 * only a resolved outcome does — completed, explicitly declined, or expired
 * (per the brief's "declined/ignored count against it" rule).
 */
export function computeCompletionScore(userId: string, prompts: DarePrompt[]): number {
  const resolved = prompts.filter(
    (p) => p.toUserId === userId && !p.boardId && (p.status === 'completed' || p.status === 'declined' || p.status === 'expired'),
  )
  if (resolved.length === 0) return 100
  const completed = resolved.filter((p) => p.status === 'completed').length
  return Math.round((completed / resolved.length) * 100)
}
