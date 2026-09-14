import { Router } from 'express'
import { db } from './db.js'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { myActivity, followingFeed, communityFeed, publicActivity } from './completionsRepo.js'
import { canViewProfileActivity, getAccountByUsername } from './accountsRepo.js'

export const feedRouter = Router()

function parsePaging(req: { query: Record<string, unknown> }, defaultLimit: number, maxLimit: number) {
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  return { limit, offset }
}

feedRouter.get('/api/me/activity', requireAuth, (req, res) => {
  const { limit, offset } = parsePaging(req, 500, 1000)
  res.json(myActivity(req.account!.id, limit, offset))
})

feedRouter.get('/api/feed/following', requireAuth, (req, res) => {
  const { limit, offset } = parsePaging(req, 50, 100)
  res.json(followingFeed(req.account!.id, limit, offset))
})

feedRouter.get('/api/feed/community', requireAuth, (req, res) => {
  const { limit, offset } = parsePaging(req, 50, 100)
  res.json(communityFeed(req.account!.id, limit, offset))
})

feedRouter.get('/api/accounts/:username/activity', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  const viewerId = resolveOptionalAccountId(req)
  // Same gate accountsRepo.ts's publicProfile() reports as canViewActivity —
  // enforced here too so a private profile's calendar can't be read by
  // calling this endpoint directly instead of going through the profile.
  if (!canViewProfileActivity(target, viewerId)) return res.json([])
  const { limit, offset } = parsePaging(req, 100, 200)
  res.json(publicActivity(target.id, viewerId, limit, offset))
})

// Completion score: of every 1:1 prompt directly sent to you that's been
// resolved one way or another (completed, declined, or left to expire),
// what share did you actually complete — plus every board/organization
// broadcast you've completed, added to both sides of the ratio equally.
// A broadcast has no "you ignored it" outcome to weigh against (there's no
// deadline or decline), so it can only ever help your score, never hurt
// it — but completing one is still a real completed prompt and should
// still move the number.
const resolvedOneToOne = db.prepare(`
  SELECT status FROM prompts WHERE is_broadcast = 0 AND recipient_account_id = ? AND status IN ('completed', 'declined', 'expired')
`)
const completedBroadcastCount = db.prepare(`SELECT COUNT(*) AS n FROM prompt_completions WHERE completer_account_id = ?`)

feedRouter.get('/api/me/completion-score', requireAuth, (req, res) => {
  const rows = resolvedOneToOne.all(req.account!.id) as { status: string }[]
  const broadcastsCompleted = (completedBroadcastCount.get(req.account!.id) as { n: number }).n
  const completed = rows.filter((r) => r.status === 'completed').length + broadcastsCompleted
  const total = rows.length + broadcastsCompleted
  if (total === 0) return res.json({ score: null, completed: 0, total: 0 })
  res.json({ score: Math.round((completed / total) * 100), completed, total })
})
