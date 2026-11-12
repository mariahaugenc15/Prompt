import crypto from 'node:crypto'
import { db } from './db.js'
import { isoWeekRange, localDayKey } from './timezoneWeek.js'
import { scoreCompletions, type ScorableCompletion } from './gameScoring.js'
import { getAccountById, displayName } from './accountsRepo.js'
import { getSubscriberIds } from './boardsRepo.js'
import { notifyForEvent } from './notificationsRepo.js'
import { awardAchievementStamp, countAchievementStamps } from './stampsRepo.js'

export interface BoardGameSettings {
  boardId: string
  enabled: boolean
  timezone: string
  hideRanks: boolean
  disabledByAdmin: boolean
}

const getSettingsStmt = db.prepare(
  `SELECT board_id AS boardId, enabled, timezone, hide_ranks AS hideRanks, disabled_by_admin AS disabledByAdmin FROM board_games WHERE board_id = ?`,
)

export function getGameSettings(boardId: string): BoardGameSettings | undefined {
  const row = getSettingsStmt.get(boardId) as
    | { boardId: string; enabled: number; timezone: string; hideRanks: number; disabledByAdmin: number }
    | undefined
  if (!row) return undefined
  return { boardId: row.boardId, enabled: Boolean(row.enabled), timezone: row.timezone, hideRanks: Boolean(row.hideRanks), disabledByAdmin: Boolean(row.disabledByAdmin) }
}

const upsertSettingsStmt = db.prepare(`
  INSERT INTO board_games (board_id, enabled, timezone, hide_ranks, created_at) VALUES (@boardId, @enabled, @timezone, @hideRanks, @createdAt)
  ON CONFLICT(board_id) DO UPDATE SET enabled = @enabled, timezone = @timezone, hide_ranks = @hideRanks
`)

// A board owner enabling the game for the first time (or re-enabling it)
// kicks off a "game_started" notification to every member and makes sure
// a current week exists right away, rather than waiting for the next
// scheduled tick to notice.
export function setGameSettings(boardId: string, input: { enabled: boolean; timezone: string; hideRanks: boolean }): void {
  const before = getGameSettings(boardId)
  upsertSettingsStmt.run({ boardId, enabled: input.enabled ? 1 : 0, timezone: input.timezone, hideRanks: input.hideRanks ? 1 : 0, createdAt: Date.now() })
  if (input.enabled && !before?.enabled) {
    ensureCurrentWeek(boardId)
    for (const accountId of getSubscriberIds(boardId)) {
      notifyForEvent(accountId, 'game_started', 'A weekly game just started', 'Complete prompts in this board to climb the leaderboard.', `/boards/${boardId}`)
    }
  }
}

export function setGameDisabledByAdmin(boardId: string, disabled: boolean): void {
  db.prepare(`UPDATE board_games SET disabled_by_admin = ? WHERE board_id = ?`).run(disabled ? 1 : 0, boardId)
}

const enabledBoardIdsStmt = db.prepare(`SELECT board_id AS boardId FROM board_games WHERE enabled = 1 AND disabled_by_admin = 0`)

export function listEnabledGameBoardIds(): string[] {
  return (enabledBoardIdsStmt.all() as { boardId: string }[]).map((r) => r.boardId)
}

const adminListStmt = db.prepare(`
  SELECT bg.board_id AS boardId, b.name AS boardName, bg.enabled, bg.timezone, bg.hide_ranks AS hideRanks, bg.disabled_by_admin AS disabledByAdmin
  FROM board_games bg JOIN boards b ON b.id = bg.board_id
  ORDER BY bg.created_at DESC
`)

export interface AdminGameRow {
  boardId: string
  boardName: string
  enabled: boolean
  timezone: string
  hideRanks: boolean
  disabledByAdmin: boolean
}

export function adminListGames(): AdminGameRow[] {
  return (
    adminListStmt.all() as { boardId: string; boardName: string; enabled: number; timezone: string; hideRanks: number; disabledByAdmin: number }[]
  ).map((r) => ({
    boardId: r.boardId,
    boardName: r.boardName,
    enabled: Boolean(r.enabled),
    timezone: r.timezone,
    hideRanks: Boolean(r.hideRanks),
    disabledByAdmin: Boolean(r.disabledByAdmin),
  }))
}

export interface GameWeekRow {
  id: string
  board_id: string
  week_start: number
  week_end: number
  ended_at: number | null
  created_at: number
}

const getCurrentWeekStmt = db.prepare(`SELECT * FROM game_weeks WHERE board_id = ? AND ended_at IS NULL ORDER BY week_start DESC LIMIT 1`)
const getWeekByStartStmt = db.prepare(`SELECT * FROM game_weeks WHERE board_id = ? AND week_start = ?`)
const insertWeekStmt = db.prepare(`INSERT OR IGNORE INTO game_weeks (id, board_id, week_start, week_end, created_at) VALUES (?, ?, ?, ?, ?)`)
const endWeekStmt = db.prepare(`UPDATE game_weeks SET ended_at = ? WHERE id = ? AND ended_at IS NULL`)

// Idempotent and callable from anywhere (the enable-toggle above, every
// leaderboard read, and the daily rollover job): if the board's current
// week row has already ended (its end time passed) this ends it and opens
// the next one; if there's no current week yet it opens the first one;
// otherwise it's a no-op read. INSERT OR IGNORE's UNIQUE(board_id,
// week_start) is the real safety net if two callers race.
export function ensureCurrentWeek(boardId: string): GameWeekRow {
  const settings = getGameSettings(boardId)
  const timezone = settings?.timezone ?? 'UTC'
  const existing = getCurrentWeekStmt.get(boardId) as GameWeekRow | undefined
  if (existing && existing.week_end > Date.now()) return existing
  if (existing) finishWeek(existing)
  const { start, end } = isoWeekRange(timezone)
  const id = crypto.randomUUID()
  insertWeekStmt.run(id, boardId, start, end, Date.now())
  // Fetched by the week_start we just computed, not by "the row with
  // ended_at IS NULL" — if `start` happens to match the week we just
  // ended above (board_games' timezone changed, or "now" was forced
  // past a week_end that wasn't actually a real week boundary, e.g. by
  // hand-editing the database), the UNIQUE(board_id, week_start)
  // constraint makes the insert a no-op, and the row that already
  // exists for that week_start is already ended — which would make the
  // ended_at-IS-NULL lookup find nothing and return undefined. Looking
  // it up by its actual key always finds a row.
  return getWeekByStartStmt.get(boardId, start) as GameWeekRow
}

export interface LeaderboardEntry {
  accountId: string
  username: string
  displayName: string
  points: number
  completions: number
  rank: number
}

const weekCompletionsStmt = db.prepare(`
  SELECT c.completer_account_id AS accountId, p.category AS category, p.created_at AS promptCreatedAt, c.created_at AS completedAt
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  WHERE p.board_id = ? AND p.is_broadcast = 1 AND c.created_at >= ? AND c.created_at < ?
`)

const optOutsStmt = db.prepare(`SELECT account_id AS accountId FROM game_opt_outs WHERE board_id = ?`)

export function getOptOuts(boardId: string): Set<string> {
  return new Set((optOutsStmt.all(boardId) as { accountId: string }[]).map((r) => r.accountId))
}

export function setOptOut(boardId: string, accountId: string, optOut: boolean): void {
  if (optOut) {
    db.prepare(`INSERT OR IGNORE INTO game_opt_outs (board_id, account_id, created_at) VALUES (?, ?, ?)`).run(boardId, accountId, Date.now())
  } else {
    db.prepare(`DELETE FROM game_opt_outs WHERE board_id = ? AND account_id = ?`).run(boardId, accountId)
  }
}

// The one function every leaderboard view (live current-week, a past
// week from history, the rollover job deciding a winner) computes
// through — never a different query for each, so there is exactly one
// implementation of "how points are decided from completions" at runtime
// (gameScoring.ts's scoreCompletions holds the actual formula).
export function computeWeekLeaderboard(boardId: string, week: { week_start: number; week_end: number }, timezone: string): LeaderboardEntry[] {
  const rows = weekCompletionsStmt.all(boardId, week.week_start, week.week_end) as {
    accountId: string
    category: string
    promptCreatedAt: number
    completedAt: number
  }[]
  const optedOut = getOptOuts(boardId)
  const scorable: ScorableCompletion[] = rows
    .filter((r) => !optedOut.has(r.accountId))
    .map((r) => ({ ...r, dayKey: localDayKey(timezone, r.completedAt) }))
  const scores = scoreCompletions(scorable)
  const entries: Omit<LeaderboardEntry, 'rank'>[] = Array.from(scores.values()).map((s) => {
    const account = getAccountById(s.accountId)
    return { accountId: s.accountId, username: account?.username ?? '', displayName: account ? displayName(account) : '', points: s.points, completions: s.completions }
  })
  entries.sort((a, b) => b.points - a.points)
  return entries.map((e, i) => ({ ...e, rank: i + 1 }))
}

const pastWeeksStmt = db.prepare(`SELECT * FROM game_weeks WHERE board_id = ? AND ended_at IS NOT NULL ORDER BY week_start DESC LIMIT ? OFFSET ?`)

export function getPastWeeks(boardId: string, limit = 20, offset = 0): GameWeekRow[] {
  return pastWeeksStmt.all(boardId, limit, offset) as GameWeekRow[]
}

export function getWeekWinnerCount(accountId: string): number {
  return countAchievementStamps(accountId, 'week_winner')
}

// Ends a week: awards the "Week winner" stamp (ties all win — "never
// shame last place" cuts the other way too, there's no reason to deny a
// tie its win), sends the week_ended notification, and notifies the
// winner(s) specifically. awardAchievementStamp is keyed by this week's
// own id, so re-running this for an already-ended week (the UNIQUE
// constraint on user_stamps already guards duplicate awards) never
// double-awards.
const getSnapshotStmt = db.prepare(`SELECT rank, week_id AS weekId FROM game_rank_snapshots WHERE board_id = ? AND account_id = ?`)
const upsertSnapshotStmt = db.prepare(`
  INSERT INTO game_rank_snapshots (board_id, account_id, week_id, rank) VALUES (?, ?, ?, ?)
  ON CONFLICT(board_id, account_id) DO UPDATE SET week_id = excluded.week_id, rank = excluded.rank
`)

// Run once a day per enabled-game board (gameJobs.ts). A numerically
// higher rank than yesterday's snapshot for the same week means someone
// else's completions moved ahead of this account since the last check —
// exactly one notification per account per day at most, which is the
// actual throttle (not a cooldown timer layered on top of a check that
// could otherwise fire on every completion).
export function runDailyGameCheck(boardId: string): void {
  const settings = getGameSettings(boardId)
  if (!settings?.enabled || settings.disabledByAdmin) return
  const week = ensureCurrentWeek(boardId)
  const leaderboard = computeWeekLeaderboard(boardId, week, settings.timezone)
  for (const entry of leaderboard) {
    const prev = getSnapshotStmt.get(boardId, entry.accountId) as { rank: number; weekId: string } | undefined
    if (prev && prev.weekId === week.id && entry.rank > prev.rank) {
      notifyForEvent(entry.accountId, 'game_overtaken', 'You were passed', 'Someone moved ahead of you on the weekly leaderboard.', `/boards/${boardId}`)
    }
    upsertSnapshotStmt.run(boardId, entry.accountId, week.id, entry.rank)
  }
}

function finishWeek(week: GameWeekRow): void {
  endWeekStmt.run(Date.now(), week.id)
  const settings = getGameSettings(week.board_id)
  const timezone = settings?.timezone ?? 'UTC'
  const leaderboard = computeWeekLeaderboard(week.board_id, week, timezone)
  const topScore = leaderboard[0]?.points ?? 0
  const winners = topScore > 0 ? leaderboard.filter((e) => e.points === topScore) : []
  for (const winner of winners) {
    awardAchievementStamp(winner.accountId, week.id, 'week_winner')
  }
  for (const accountId of getSubscriberIds(week.board_id)) {
    const isWinner = winners.some((w) => w.accountId === accountId)
    notifyForEvent(
      accountId,
      isWinner ? 'game_winner' : 'game_week_ended',
      isWinner ? 'You won the week!' : 'This week’s game has ended',
      isWinner ? 'Your weekly stamp is in your collection.' : 'See how everyone finished and start a new week.',
      `/boards/${week.board_id}`,
    )
  }
}
