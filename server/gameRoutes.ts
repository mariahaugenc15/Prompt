import { Router } from 'express'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { getBoardById, getSubscriberIds } from './boardsRepo.js'
import { hasOptedIntoAdultContent } from './accountsRepo.js'
import {
  getGameSettings,
  setGameSettings,
  ensureCurrentWeek,
  computeWeekLeaderboard,
  getPastWeeks,
  getOptOuts,
  setOptOut,
  getWeekWinnerCount,
} from './gameRepo.js'

export const gameRouter = Router()

const VALID_TIMEZONES = (() => {
  try {
    return new Set((Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [])
  } catch {
    return new Set<string>()
  }
})()

// Intl.supportedValuesOf('timeZone') is the IANA database listing, which
// omits the 'UTC' alias itself even though every JS engine accepts it as
// a timeZone value — checked separately rather than left to fail the
// allow-list.
function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  if (tz === 'UTC') return true
  if (VALID_TIMEZONES.size > 0) return VALID_TIMEZONES.has(tz)
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// 13.4: an 18+ board follows the exact same visibility rule every other
// board surface already does (boardsRoutes.ts's /api/boards/:id/challenges)
// — not gating this would mean the game leaderboard leaks a hint that an
// adult board exists and is active to someone who hasn't opted in.
// Exported for teamChallengeRoutes.ts, which needs the exact same 18+/
// invite-board gate for its own board-scoped endpoints.
export function checkBoardAccess(boardId: string, viewerId: string | undefined): { ok: true; board: ReturnType<typeof getBoardById> } | { ok: false; status: number; message: string } {
  const board = getBoardById(boardId)
  if (!board) return { ok: false, status: 404, message: 'No board with that id.' }
  if (board.visibility === 'invite' && (!viewerId || (board.owner_account_id !== viewerId && !getSubscriberIds(board.id).includes(viewerId)))) {
    return { ok: false, status: 404, message: 'No board with that id.' }
  }
  const isOwner = viewerId === board.owner_account_id
  if (board.is_adult && !isOwner && (!viewerId || !hasOptedIntoAdultContent(viewerId))) {
    return { ok: false, status: 403, message: 'This board is marked 18+. Opt in to adult content in your settings first.' }
  }
  return { ok: true, board }
}

gameRouter.get('/api/boards/:id/game', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const access = checkBoardAccess(String(req.params.id), viewerId)
  if (!access.ok) return res.status(access.status).json({ errors: { form: access.message } })
  const settings = getGameSettings(access.board!.id)
  res.json(settings ?? { boardId: access.board!.id, enabled: false, timezone: 'UTC', hideRanks: false, disabledByAdmin: false })
})

gameRouter.patch('/api/boards/:id/game', requireAuth, (req, res) => {
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== req.account!.id) return res.status(403).json({ errors: { form: 'Only the board owner can configure its game.' } })

  const current = getGameSettings(board.id)
  const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : (current?.enabled ?? false)
  const timezone = req.body?.timezone !== undefined ? req.body.timezone : (current?.timezone ?? 'UTC')
  const hideRanks = typeof req.body?.hideRanks === 'boolean' ? req.body.hideRanks : (current?.hideRanks ?? false)
  if (!isValidTimezone(timezone)) return res.status(422).json({ errors: { timezone: 'Not a recognized timezone.' } })

  setGameSettings(board.id, { enabled, timezone, hideRanks })
  res.json(getGameSettings(board.id))
})

gameRouter.get('/api/boards/:id/game/leaderboard', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const access = checkBoardAccess(String(req.params.id), viewerId)
  if (!access.ok) return res.status(access.status).json({ errors: { form: access.message } })
  const board = access.board!
  const settings = getGameSettings(board.id)
  if (!settings?.enabled || settings.disabledByAdmin) {
    return res.status(404).json({ errors: { form: 'This board does not have an active game.' } })
  }
  const week = ensureCurrentWeek(board.id)
  const leaderboard = computeWeekLeaderboard(board.id, week, settings.timezone)
  res.json({
    hideRanks: settings.hideRanks,
    weekStart: week.week_start,
    weekEnd: week.week_end,
    myOptedOut: viewerId ? getOptOuts(board.id).has(viewerId) : false,
    // Ranks/points are withheld when the owner has hidden them, but
    // participation (who showed up) still isn't a secret — matches
    // 13.2's "plus everyone's participation" even in hidden-ranks mode.
    entries: leaderboard.map((e) => ({
      username: e.username,
      displayName: e.displayName,
      completions: e.completions,
      points: settings.hideRanks ? undefined : e.points,
      rank: settings.hideRanks ? undefined : e.rank,
    })),
  })
})

gameRouter.get('/api/boards/:id/game/weeks', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const access = checkBoardAccess(String(req.params.id), viewerId)
  if (!access.ok) return res.status(access.status).json({ errors: { form: access.message } })
  const board = access.board!
  const settings = getGameSettings(board.id)
  const weeks = getPastWeeks(board.id)
  res.json(
    weeks.map((w) => {
      const leaderboard = computeWeekLeaderboard(board.id, w, settings?.timezone ?? 'UTC')
      const top = leaderboard[0]
      return {
        id: w.id,
        weekStart: w.week_start,
        weekEnd: w.week_end,
        winner: top && top.points > 0 ? { username: top.username, displayName: top.displayName, points: top.points } : null,
      }
    }),
  )
})

gameRouter.post('/api/boards/:id/game/opt-out', requireAuth, (req, res) => {
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  const optOut = req.body?.optOut === true
  setOptOut(board.id, req.account!.id, optOut)
  res.json({ ok: true, optedOut: optOut })
})

gameRouter.get('/api/me/week-winner-count', requireAuth, (req, res) => {
  res.json({ count: getWeekWinnerCount(req.account!.id) })
})
