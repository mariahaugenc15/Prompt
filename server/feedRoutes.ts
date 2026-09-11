import { Router } from 'express'
import { db } from './db.js'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { myActivity, followingFeed, communityFeed, publicActivity } from './completionsRepo.js'
import { getAccountByUsername } from './accountsRepo.js'

export const feedRouter = Router()

feedRouter.get('/api/me/activity', requireAuth, (req, res) => {
  res.json(myActivity(req.account!.id))
})

feedRouter.get('/api/feed/following', requireAuth, (req, res) => {
  res.json(followingFeed(req.account!.id))
})

feedRouter.get('/api/feed/community', requireAuth, (req, res) => {
  res.json(communityFeed(req.account!.id))
})

feedRouter.get('/api/accounts/:username/activity', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  res.json(publicActivity(target.id, resolveOptionalAccountId(req)))
})

// Completion score: of every 1:1 prompt directly sent to you that's been
// resolved one way or another (completed, declined, or left to expire),
// what share did you actually complete. A board/organization broadcast is
// something you opt into by browsing, not something sent at you to
// resolve, so it isn't part of this ratio — it just doesn't have an
// equivalent "you ignored it" outcome to weigh against.
const resolvedOneToOne = db.prepare(`
  SELECT status FROM prompts WHERE is_broadcast = 0 AND recipient_account_id = ? AND status IN ('completed', 'declined', 'expired')
`)

feedRouter.get('/api/me/completion-score', requireAuth, (req, res) => {
  const rows = resolvedOneToOne.all(req.account!.id) as { status: string }[]
  if (rows.length === 0) return res.json({ score: null, completed: 0, total: 0 })
  const completed = rows.filter((r) => r.status === 'completed').length
  res.json({ score: Math.round((completed / rows.length) * 100), completed, total: rows.length })
})
