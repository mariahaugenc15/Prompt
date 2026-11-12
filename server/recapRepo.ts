import { db } from './db.js'
import { getAccountById } from './accountsRepo.js'

// Minimum completions for a "real" recap rather than the gentle thin-month
// version (spec: "fewer than three completions").
const THIN_MONTH_THRESHOLD = 3

export interface RecapData {
  monthKey: string
  thin: boolean
  totalCompletions: number
  completionScore: number | null
  favoriteCategory: string | null
  longestStreakDays: number
  mostLaughedAt: { completionId: string; text: string; laughs: number } | null
  topFriend: { username: string; displayName: string; exchangeCount: number } | null
}

function monthBounds(monthKey: string): { start: number; end: number } {
  const [year, month] = monthKey.split('-').map(Number)
  const start = Date.UTC(year, month - 1, 1)
  const end = Date.UTC(year, month, 1)
  return { start, end }
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

// A month's recap can only be computed once every timestamp it depends on
// is in the past, i.e. once the month itself has ended — this also keeps
// the cache in recapRepo.getRecap() permanently valid (nothing about a
// past month's figures can ever change after the fact).
export function monthHasEnded(monthKey: string): boolean {
  return monthKey < currentMonthKey()
}

interface MyCompletionRow {
  id: string
  category: string
  text: string
  ts: number
}

const myCompletionsThisMonth = db.prepare(`
  SELECT p.id AS id, p.category AS category, p.prompt_text AS text, p.completed_at AS ts
  FROM prompts p
  WHERE p.is_broadcast = 0 AND p.status = 'completed' AND p.recipient_account_id = ?
    AND p.completed_at >= ? AND p.completed_at < ?

  UNION ALL

  SELECT c.id AS id, p.category AS category, p.prompt_text AS text, c.created_at AS ts
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  WHERE c.completer_account_id = ? AND c.created_at >= ? AND c.created_at < ?
`)

const resolvedOneToOneThisMonth = db.prepare(`
  SELECT status FROM prompts
  WHERE is_broadcast = 0 AND recipient_account_id = ? AND created_at >= ? AND created_at < ?
    AND status IN ('completed', 'declined', 'expired')
`)

const laughCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM completion_reactions WHERE completion_id = ? AND kind = 'laugh'`)

// "Exchanged the most prompts with" counts every 1:1 prompt between the
// two accounts in either direction, sent in this calendar month,
// completed or not — this is about who you were talking to, not just who
// you finished things for.
const topFriendStmt = db.prepare(`
  SELECT
    CASE WHEN sender_account_id = ? THEN recipient_account_id ELSE sender_account_id END AS friendId,
    COUNT(*) AS cnt
  FROM prompts
  WHERE is_broadcast = 0 AND recipient_account_id IS NOT NULL
    AND created_at >= ? AND created_at < ?
    AND (sender_account_id = ? OR recipient_account_id = ?)
  GROUP BY friendId
  ORDER BY cnt DESC
  LIMIT 1
`)

function longestStreakDays(dayKeys: string[]): number {
  const uniqueSorted = Array.from(new Set(dayKeys)).sort()
  if (uniqueSorted.length === 0) return 0
  let longest = 1
  let current = 1
  for (let i = 1; i < uniqueSorted.length; i++) {
    const prev = new Date(uniqueSorted[i - 1] + 'T00:00:00Z').getTime()
    const cur = new Date(uniqueSorted[i] + 'T00:00:00Z').getTime()
    if (cur - prev === 24 * 60 * 60 * 1000) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }
  return longest
}

function computeRecapData(accountId: string, monthKey: string): RecapData {
  const { start, end } = monthBounds(monthKey)
  const myRows = myCompletionsThisMonth.all(accountId, start, end, accountId, start, end) as MyCompletionRow[]
  const totalCompletions = myRows.length

  if (totalCompletions < THIN_MONTH_THRESHOLD) {
    return {
      monthKey,
      thin: true,
      totalCompletions,
      completionScore: null,
      favoriteCategory: null,
      longestStreakDays: 0,
      mostLaughedAt: null,
      topFriend: null,
    }
  }

  const categoryCounts = new Map<string, number>()
  for (const row of myRows) categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1)
  let favoriteCategory: string | null = null
  let favoriteCount = -1
  for (const [category, count] of categoryCounts) {
    if (count > favoriteCount) {
      favoriteCategory = category
      favoriteCount = count
    }
  }

  const longestStreak = longestStreakDays(myRows.map((r) => new Date(r.ts).toISOString().slice(0, 10)))

  let mostLaughedAt: RecapData['mostLaughedAt'] = null
  for (const row of myRows) {
    const laughs = (laughCountStmt.get(row.id) as { n: number }).n
    if (laughs > 0 && (!mostLaughedAt || laughs > mostLaughedAt.laughs)) {
      mostLaughedAt = { completionId: row.id, text: row.text, laughs }
    }
  }

  // Same resolved-ratio formula as /api/me/completion-score
  // (server/feedRoutes.ts), scoped to this month: every 1:1 prompt sent to
  // you this month that's been resolved one way or another, versus how
  // many you completed, plus every broadcast you completed added to both
  // sides. myRows already holds every completion (1:1 and broadcast) you
  // made this month, so the broadcast share of it is exactly the part not
  // already counted by the resolved 1:1 rows below.
  const resolvedRows = resolvedOneToOneThisMonth.all(accountId, start, end) as { status: string }[]
  const oneToOneCompletedCount = resolvedRows.filter((r) => r.status === 'completed').length
  const broadcastCount = totalCompletions - oneToOneCompletedCount
  const completed = oneToOneCompletedCount + broadcastCount
  const total = resolvedRows.length + broadcastCount
  const completionScore = total === 0 ? null : Math.round((completed / total) * 100)

  const friendRow = topFriendStmt.get(accountId, start, end, accountId, accountId) as { friendId: string; cnt: number } | undefined
  let topFriend: RecapData['topFriend'] = null
  if (friendRow) {
    const friend = getAccountById(friendRow.friendId)
    if (friend) {
      topFriend = {
        username: friend.username,
        displayName: friend.account_type === 'organization' ? (friend.organization_name ?? friend.username) : (friend.first_name ?? friend.username),
        exchangeCount: friendRow.cnt,
      }
    }
  }

  return {
    monthKey,
    thin: false,
    totalCompletions,
    completionScore,
    favoriteCategory,
    longestStreakDays: longestStreak,
    mostLaughedAt,
    topFriend,
  }
}

const getCachedStmt = db.prepare(`SELECT data FROM monthly_recaps WHERE account_id = ? AND month_key = ?`)
const insertCacheStmt = db.prepare(
  `INSERT OR IGNORE INTO monthly_recaps (account_id, month_key, data, computed_at) VALUES (?, ?, ?, ?)`,
)

// Compute on demand, cache forever (see db.ts's monthly_recaps comment for
// why that's safe). INSERT OR IGNORE means a race between two requests
// for the same never-yet-cached month just computes it twice and the
// second write is a no-op — simpler than a lock for something this cheap.
export function getRecap(accountId: string, monthKey: string): RecapData | undefined {
  if (!monthHasEnded(monthKey)) return undefined
  const cached = getCachedStmt.get(accountId, monthKey) as { data: string } | undefined
  if (cached) return JSON.parse(cached.data) as RecapData
  const data = computeRecapData(accountId, monthKey)
  insertCacheStmt.run(accountId, monthKey, JSON.stringify(data), Date.now())
  return data
}

// The month that just ended, as of "now" — used by the profile feed to
// decide whether to show a fresh recap card, and by the Phase 11 push job.
export function justEndedMonthKey(): string {
  const now = new Date()
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const lastMonth = new Date(firstOfThisMonth - 1) // one ms before the 1st = last day of the previous month
  return lastMonth.toISOString().slice(0, 7)
}
