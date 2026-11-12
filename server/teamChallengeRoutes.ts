import { Router } from 'express'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { getBoardById, getSubscriberIds } from './boardsRepo.js'
import { checkBoardAccess } from './gameRoutes.js'
import { createChallenge, listChallengesForBoard, getChallengeById, ensureChallengeEnded, computeStandings } from './teamChallengeRepo.js'

export const teamChallengeRouter = Router()

const MIN_TEAMS = 2
const MAX_PERIOD_DAYS = 90

teamChallengeRouter.post('/api/boards/:id/team-challenges', requireAuth, (req, res) => {
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== req.account!.id) {
    return res.status(403).json({ errors: { form: 'Only the board owner can start a team challenge.' } })
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) return res.status(422).json({ errors: { name: 'Give the challenge a name.' } })

  const teamCount = Number(req.body?.teamCount)
  const memberCount = getSubscriberIds(board.id).length
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS) {
    return res.status(422).json({ errors: { teamCount: `A team challenge needs at least ${MIN_TEAMS} teams.` } })
  }
  if (teamCount > memberCount) {
    return res.status(422).json({ errors: { teamCount: 'Not enough board members to fill that many teams.' } })
  }

  const periodDays = Number(req.body?.periodDays)
  if (!Number.isFinite(periodDays) || periodDays <= 0 || periodDays > MAX_PERIOD_DAYS) {
    return res.status(422).json({ errors: { periodDays: `Period must be between 1 and ${MAX_PERIOD_DAYS} days.` } })
  }

  const periodStart = Date.now()
  const periodEnd = periodStart + periodDays * 24 * 60 * 60 * 1000
  const challenge = createChallenge({ boardId: board.id, name, createdBy: req.account!.id, periodStart, periodEnd, teamCount })
  res.status(201).json(challenge)
})

teamChallengeRouter.get('/api/boards/:id/team-challenges', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const access = checkBoardAccess(String(req.params.id), viewerId)
  if (!access.ok) return res.status(access.status).json({ errors: { form: access.message } })
  res.json(listChallengesForBoard(access.board!.id))
})

teamChallengeRouter.get('/api/team-challenges/:id', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  let challenge = getChallengeById(String(req.params.id))
  if (!challenge) return res.status(404).json({ errors: { form: 'No team challenge with that id.' } })
  const access = checkBoardAccess(challenge.board_id, viewerId)
  if (!access.ok) return res.status(access.status).json({ errors: { form: access.message } })
  challenge = ensureChallengeEnded(challenge)
  res.json({ ...challenge, standings: computeStandings(challenge) })
})
