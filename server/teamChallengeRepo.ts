import crypto from 'node:crypto'
import { db } from './db.js'
import { localDayKey } from './timezoneWeek.js'
import { scoreCompletions, type ScorableCompletion } from './gameScoring.js'
import { getAccountById, displayName } from './accountsRepo.js'
import { getSubscriberIds } from './boardsRepo.js'
import { notifyForEvent } from './notificationsRepo.js'
import { awardAchievementStamp } from './stampsRepo.js'
import { getGameSettings } from './gameRepo.js'

export interface ChallengeRow {
  id: string
  board_id: string
  name: string
  period_start: number
  period_end: number
  status: 'active' | 'ended'
  created_by: string
  created_at: number
}

export function getChallengeById(id: string): ChallengeRow | undefined {
  return db.prepare('SELECT * FROM team_challenges WHERE id = ?').get(id) as ChallengeRow | undefined
}

const listChallengesStmt = db.prepare('SELECT * FROM team_challenges WHERE board_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')

export function listChallengesForBoard(boardId: string, limit = 20, offset = 0): ChallengeRow[] {
  return listChallengesStmt.all(boardId, limit, offset) as ChallengeRow[]
}

// Fisher-Yates — every member ends up on exactly one team, shuffled with
// no bias toward whichever position they joined the board in.
function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const insertChallengeStmt = db.prepare(`
  INSERT INTO team_challenges (id, board_id, name, period_start, period_end, status, created_by, created_at)
  VALUES (@id, @boardId, @name, @periodStart, @periodEnd, 'active', @createdBy, @createdAt)
`)
const insertTeamStmt = db.prepare(`INSERT INTO challenge_teams (id, challenge_id, name) VALUES (?, ?, ?)`)
const insertMemberStmt = db.prepare(`INSERT INTO challenge_team_members (team_id, account_id) VALUES (?, ?)`)

// 13.3's "captains pick, or random shuffle" — this implementation does
// only the random-shuffle half; manual captain-pick assignment is left
// as a documented non-goal given the scope of everything else in this
// phase (see the commit message). Every current board subscriber is
// placed on exactly one of `teamCount` teams, split as evenly as
// Math.floor allows (a remainder member or two lands on the earliest
// teams, same tie-breaking any round-robin deal would give).
export function createChallenge(input: { boardId: string; name: string; createdBy: string; periodStart: number; periodEnd: number; teamCount: number }): ChallengeRow {
  const id = crypto.randomUUID()
  const memberIds = shuffle(getSubscriberIds(input.boardId))
  db.transaction(() => {
    insertChallengeStmt.run({
      id,
      boardId: input.boardId,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      createdBy: input.createdBy,
      createdAt: Date.now(),
    })
    const teamIds: string[] = []
    for (let i = 0; i < input.teamCount; i++) {
      const teamId = crypto.randomUUID()
      teamIds.push(teamId)
      insertTeamStmt.run(teamId, id, `Team ${i + 1}`)
    }
    memberIds.forEach((accountId, i) => {
      insertMemberStmt.run(teamIds[i % teamIds.length], accountId)
    })
  })()
  return getChallengeById(id)!
}

interface TeamRow {
  id: string
  name: string
}

const teamsForChallengeStmt = db.prepare('SELECT id, name FROM challenge_teams WHERE challenge_id = ?')
const membersForTeamStmt = db.prepare('SELECT account_id AS accountId FROM challenge_team_members WHERE team_id = ?')

const periodCompletionsStmt = db.prepare(`
  SELECT c.completer_account_id AS accountId, p.category AS category, p.created_at AS promptCreatedAt, c.created_at AS completedAt
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  WHERE p.board_id = ? AND p.is_broadcast = 1 AND c.created_at >= ? AND c.created_at < ?
`)

export interface TeamStanding {
  teamId: string
  name: string
  memberCount: number
  memberDisplayNames: string[]
  totalPoints: number
  averagePoints: number
  rank: number
}

// Team score is the average per member (13.3: "so uneven team sizes are
// fair") — computed from the same gameScoring.ts formula every other
// score in this phase uses, just scoped to the challenge's own period
// instead of a calendar week, and summed per team instead of read
// per account.
export function computeStandings(challenge: ChallengeRow): TeamStanding[] {
  const settings = getGameSettings(challenge.board_id)
  const timezone = settings?.timezone ?? 'UTC'
  const rows = periodCompletionsStmt.all(challenge.board_id, challenge.period_start, challenge.period_end) as {
    accountId: string
    category: string
    promptCreatedAt: number
    completedAt: number
  }[]
  const scorable: ScorableCompletion[] = rows.map((r) => ({ ...r, dayKey: localDayKey(timezone, r.completedAt) }))
  const scores = scoreCompletions(scorable)

  const teams = teamsForChallengeStmt.all(challenge.id) as TeamRow[]
  const standings = teams.map((team) => {
    const memberIds = (membersForTeamStmt.all(team.id) as { accountId: string }[]).map((m) => m.accountId)
    const totalPoints = memberIds.reduce((sum, id) => sum + (scores.get(id)?.points ?? 0), 0)
    const memberDisplayNames = memberIds.map((id) => {
      const account = getAccountById(id)
      return account ? displayName(account) : 'Someone'
    })
    return {
      teamId: team.id,
      name: team.name,
      memberCount: memberIds.length,
      memberDisplayNames,
      totalPoints,
      averagePoints: memberIds.length > 0 ? totalPoints / memberIds.length : 0,
    }
  })
  standings.sort((a, b) => b.averagePoints - a.averagePoints)
  return standings.map((s, i) => ({ ...s, rank: i + 1 }))
}

const endChallengeStmt = db.prepare(`UPDATE team_challenges SET status = 'ended' WHERE id = ? AND status = 'active'`)

// Idempotent the same way revealGroup/finishWeek are: the UPDATE's own
// WHERE status = 'active' means only the first caller to end a given
// challenge actually awards stamps or notifies.
export function endChallenge(challenge: ChallengeRow): void {
  const result = endChallengeStmt.run(challenge.id)
  if (result.changes === 0) return

  const standings = computeStandings(challenge)
  const topScore = standings[0]?.averagePoints ?? 0
  const winningTeams = topScore > 0 ? standings.filter((s) => s.averagePoints === topScore) : []

  for (const team of winningTeams) {
    const memberIds = (membersForTeamStmt.all(team.teamId) as { accountId: string }[]).map((m) => m.accountId)
    for (const accountId of memberIds) awardAchievementStamp(accountId, challenge.id, 'team_winner')
  }

  const winnerIds = new Set(
    winningTeams.flatMap((t) => (membersForTeamStmt.all(t.teamId) as { accountId: string }[]).map((m) => m.accountId)),
  )
  for (const accountId of getSubscriberIds(challenge.board_id)) {
    const isWinner = winnerIds.has(accountId)
    notifyForEvent(
      accountId,
      isWinner ? 'game_winner' : 'game_week_ended',
      isWinner ? 'Your team won the challenge!' : 'A team challenge has ended',
      isWinner ? `${challenge.name}: your team came out on top.` : `${challenge.name} has ended. See the final standings.`,
      `/boards/${challenge.board_id}`,
    )
  }
}

// Lazy end-of-period check, same pattern as gameRepo.ts's
// ensureCurrentWeek: called from every standings read so a challenge
// whose period has passed closes out the moment anyone next looks,
// without waiting on the scheduled sweep.
export function ensureChallengeEnded(challenge: ChallengeRow): ChallengeRow {
  if (challenge.status === 'active' && challenge.period_end <= Date.now()) {
    endChallenge(challenge)
    return getChallengeById(challenge.id)!
  }
  return challenge
}

const activeChallengeIdsStmt = db.prepare(`SELECT id FROM team_challenges WHERE status = 'active' AND period_end <= ?`)

export function listDueChallengeIds(): string[] {
  return (activeChallengeIdsStmt.all(Date.now()) as { id: string }[]).map((r) => r.id)
}
