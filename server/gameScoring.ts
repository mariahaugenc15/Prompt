// Phase 13.2's "Scoring (configurable in one place)" — every number that
// decides a weekly-game or team-challenge score lives here, nowhere else.
export const GAME_SCORING = {
  basePoints: 10,
  // A completion counts as "early" if it lands within this long of the
  // prompt being sent.
  earlyBonusWindowMs: 2 * 60 * 60 * 1000,
  earlyBonusPoints: 3,
  // Awarded once per category an account hasn't already scored in during
  // the same scoring period (a week, or a team challenge's period).
  varietyBonusPoints: 3,
  // Completions beyond this many in one local calendar day stop scoring
  // (12.2's "a daily cap to prevent spamming") — they still happened and
  // still count as participation, just not toward points.
  dailyCompletionCap: 3,
}

export interface ScorableCompletion {
  accountId: string
  category: string
  promptCreatedAt: number
  completedAt: number
  dayKey: string
}

export interface AccountScore {
  accountId: string
  points: number
  completions: number
}

// The single function every score in this phase comes from — the weekly
// leaderboard, a team's average, and the admin view all call this with a
// different slice of completions, never compute points any other way
// (13.4's "scores are computed on the server, idempotently, from recorded
// completions").
export function scoreCompletions(completions: ScorableCompletion[]): Map<string, AccountScore> {
  const byAccount = new Map<string, ScorableCompletion[]>()
  for (const c of completions) {
    const list = byAccount.get(c.accountId) ?? []
    list.push(c)
    byAccount.set(c.accountId, list)
  }

  const scores = new Map<string, AccountScore>()
  for (const [accountId, list] of byAccount) {
    list.sort((a, b) => a.completedAt - b.completedAt)
    const dailyCounts = new Map<string, number>()
    const categoriesSeen = new Set<string>()
    let points = 0
    for (const c of list) {
      const dayCount = dailyCounts.get(c.dayKey) ?? 0
      dailyCounts.set(c.dayKey, dayCount + 1)
      if (dayCount >= GAME_SCORING.dailyCompletionCap) continue // capped out for the day — participation only
      points += GAME_SCORING.basePoints
      if (c.completedAt - c.promptCreatedAt <= GAME_SCORING.earlyBonusWindowMs) points += GAME_SCORING.earlyBonusPoints
      if (!categoriesSeen.has(c.category)) {
        categoriesSeen.add(c.category)
        points += GAME_SCORING.varietyBonusPoints
      }
    }
    scores.set(accountId, { accountId, points, completions: list.length })
  }
  return scores
}
