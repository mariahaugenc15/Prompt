import { Router } from 'express'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { canFollow, type PromptPermission } from './permissions.js'
import { getAccountByUsername, getFollowers, getFollowing, listAccounts, publicProfile, searchAccounts } from './accountsRepo.js'

export const socialRouter = Router()

const PROMPT_PERMISSIONS: PromptPermission[] = ['everyone', 'followers', 'mutuals']
const setPromptPermission = db.prepare('UPDATE accounts SET prompt_permission = ? WHERE id = ?')
const accountIdByToken = db.prepare('SELECT id FROM accounts WHERE auth_token = ?')

// Every account-lookup route below accepts an optional bearer token so an
// unauthenticated viewer still sees public data, just without an
// isFollowing flag — this resolves that token to a viewer id, or undefined.
function resolveViewerId(req: { header(name: string): string | undefined }): string | undefined {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return undefined
  return (accountIdByToken.get(token) as { id: string } | undefined)?.id
}

socialRouter.get('/api/me', requireAuth, (req, res) => {
  const actor = req.account!
  res.json({
    id: actor.id,
    username: actor.username,
    accountType: actor.accountType,
    displayName: actor.displayName,
    email: actor.email,
    promptPermission: actor.promptPermission,
  })
})

// Individuals only — organizations can't receive 1:1 prompts at all, so
// the setting is meaningless for them (see server/permissions.ts).
socialRouter.patch('/api/me/prompt-permission', requireAuth, (req, res) => {
  const actor = req.account!
  if (actor.accountType === 'organization') {
    return res.status(403).json({ errors: { form: 'Organization accounts do not receive prompts.' } })
  }
  const value = String(req.body?.promptPermission ?? '')
  if (!PROMPT_PERMISSIONS.includes(value as PromptPermission)) {
    return res.status(422).json({ errors: { promptPermission: `Must be one of: ${PROMPT_PERMISSIONS.join(', ')}.` } })
  }
  setPromptPermission.run(value, actor.id)
  res.json({ promptPermission: value })
})

const insertFollow = db.prepare(
  'INSERT OR IGNORE INTO follows (follower_account_id, followee_account_id, created_at) VALUES (?, ?, ?)',
)
const deleteFollow = db.prepare('DELETE FROM follows WHERE follower_account_id = ? AND followee_account_id = ?')

// GET /api/accounts — every real account, most recent first. Backs
// Explore's profile grid, distinct from /api/search/accounts below which
// requires a query string.
socialRouter.get('/api/accounts', (req, res) => {
  const viewerId = resolveViewerId(req)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const results = listAccounts(viewerId, limit).map((a) => publicProfile(a, viewerId))
  res.json(results)
})

// GET /api/search/accounts?q=foo — backs "find people" in the client search
// bar. A separate path (not /api/accounts/:username) so a literal username
// of "search" could never collide with this route.
socialRouter.get('/api/search/accounts', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])

  const viewerId = resolveViewerId(req)
  const results = searchAccounts(q, viewerId, 12).map((a) => publicProfile(a, viewerId))
  res.json(results)
})

socialRouter.get('/api/accounts/:username', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  res.json(publicProfile(target, resolveViewerId(req)))
})

// The follow graph is otherwise a dead end (a count with nothing to click
// into) — these back a browsable list on the profile page, so someone can
// find a person by walking from an account they already know to the
// people that account follows or is followed by.
socialRouter.get('/api/accounts/:username/followers', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  const viewerId = resolveViewerId(req)
  res.json(getFollowers(target.id, 50).map((a) => publicProfile(a, viewerId)))
})

socialRouter.get('/api/accounts/:username/following', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  const viewerId = resolveViewerId(req)
  res.json(getFollowing(target.id, 50).map((a) => publicProfile(a, viewerId)))
})

socialRouter.post('/api/follow', requireAuth, (req, res) => {
  const actor = req.account!
  const permission = canFollow(actor)
  if (!permission.ok) return res.status(403).json({ errors: { form: permission.reason } })

  const targetUsername = String(req.body?.username ?? '')
  const target = getAccountByUsername(targetUsername)
  if (!target) return res.status(404).json({ errors: { username: 'No account with that username.' } })
  if (target.id === actor.id) return res.status(422).json({ errors: { username: 'You cannot follow yourself.' } })

  insertFollow.run(actor.id, target.id, Date.now())
  res.status(201).json(publicProfile(target, actor.id))
})

socialRouter.delete('/api/follow/:username', requireAuth, (req, res) => {
  const actor = req.account!
  const target = getAccountByUsername(String(req.params.username))
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })

  deleteFollow.run(actor.id, target.id)
  res.json(publicProfile(target, actor.id))
})
