import type { Prompt } from './types'

/**
 * Only friend prompts actually received count — board broadcasts and feed
 * browsing never factor in. A prompt still pending or accepted-but-in-progress
 * doesn't count against the score yet (the user hasn't had a chance to act);
 * only a resolved outcome does — completed, explicitly declined, or expired
 * (per the brief's "declined/ignored count against it" rule).
 *
 * Returns null when there's nothing resolved yet — a brand-new account has
 * no completion behavior to score, so showing a fabricated 100% would be
 * exactly the kind of "looks pre-populated" dummy data this app now avoids
 * elsewhere. Callers should render an encouragement to complete a first
 * prompt instead of a percentage in that case.
 */
export function computeCompletionScore(userId: string, prompts: Prompt[]): number | null {
  const resolved = prompts.filter(
    (p) => p.toUserId === userId && !p.boardId && (p.status === 'completed' || p.status === 'declined' || p.status === 'expired'),
  )
  if (resolved.length === 0) return null
  const completed = resolved.filter((p) => p.status === 'completed').length
  return Math.round((completed / resolved.length) * 100)
}
