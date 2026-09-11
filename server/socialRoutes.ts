import { Router, type Request } from 'express'
import { db } from './db.js'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { canFollow, type PromptPermission } from './permissions.js'
import { getAccountByUsername, getFollowers, getFollowing, listAccounts, publicProfile, searchAccounts, suggestedAccounts } from './accountsRepo.js'
import { isBlockedEitherWay } from './blocksRepo.js'
import { publicBaseUrl, saveDataUrlAsFile } from './mediaStore.js'

function parsePaging(req: Request, defaultLimit: number, maxLimit: number) {
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  return { limit, offset }
}

export const socialRouter = Router()

const PROMPT_PERMISSIONS: PromptPermission[] = ['everyone', 'followers', 'mutuals']
const setPromptPermission = db.prepare('UPDATE accounts SET prompt_permission = ? WHERE id = ?')

socialRouter.get('/api/me', requireAuth, (req, res) => {
  const actor = req.account!
  res.json({
    id: actor.id,
    username: actor.username,
    accountType: actor.accountType,
    displayName: actor.displayName,
    email: actor.email,
    promptPermission: actor.promptPermission,
    isAdmin: actor.isAdmin,
    isVerified: actor.isVerified,
    totpEnabled: actor.totpEnabled,
  })
})

const setAvatarPath = db.prepare('UPDATE accounts SET avatar_path = ? WHERE id = ?')
const setBio = db.prepare('UPDATE accounts SET bio = ? WHERE id = ?')
const MAX_BIO_LENGTH = 280

// Avatar and bio used to live only in the client's local zustand store —
// never sent to the server, so nobody else ever actually saw the picture
// or bio you set. Real columns + these two routes so a visited profile
// shows what its owner actually set, not nothing.
socialRouter.patch('/api/me/avatar', requireAuth, (req, res) => {
  const actor = req.account!
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : undefined
  if (!dataUrl) {
    setAvatarPath.run(null, actor.id)
    return res.json({ avatarUrl: undefined })
  }
  const avatarUrl = saveDataUrlAsFile(dataUrl, publicBaseUrl(req))
  setAvatarPath.run(avatarUrl, actor.id)
  res.json({ avatarUrl })
})

socialRouter.patch('/api/me/bio', requireAuth, (req, res) => {
  const actor = req.account!
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, MAX_BIO_LENGTH) : ''
  setBio.run(bio || null, actor.id)
  res.json({ bio: bio || undefined })
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
  const viewerId = resolveOptionalAccountId(req)
  const { limit, offset } = parsePaging(req, 50, 100)
  const results = listAccounts(viewerId, limit, offset).map((a) => publicProfile(a, viewerId))
  res.json(results)
})

// GET /api/accounts/suggested — people you may know: followed by accounts
// you follow, falling back to recently-joined accounts when that graph
// walk comes up short.
socialRouter.get('/api/accounts/suggested', requireAuth, (req, res) => {
  const me = req.account!
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  res.json(suggestedAccounts(me.id, limit).map((a) => publicProfile(a, me.id)))
})

// GET /api/search/accounts?q=foo — backs "find people" in the client search
// bar. A separate path (not /api/accounts/:username) so a literal username
// of "search" could never collide with this route.
socialRouter.get('/api/search/accounts', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])

  const viewerId = resolveOptionalAccountId(req)
  const { limit, offset } = parsePaging(req, 12, 50)
  const results = searchAccounts(q, viewerId, limit, offset).map((a) => publicProfile(a, viewerId))
  res.json(results)
})

socialRouter.get('/api/accounts/:username', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  res.json(publicProfile(target, resolveOptionalAccountId(req)))
})

// The follow graph is otherwise a dead end (a count with nothing to click
// into) — these back a browsable list on the profile page, so someone can
// find a person by walking from an account they already know to the
// people that account follows or is followed by.
socialRouter.get('/api/accounts/:username/followers', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  const viewerId = resolveOptionalAccountId(req)
  const { limit, offset } = parsePaging(req, 50, 100)
  res.json(getFollowers(target.id, limit, offset, viewerId).map((a) => publicProfile(a, viewerId)))
})

socialRouter.get('/api/accounts/:username/following', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  const viewerId = resolveOptionalAccountId(req)
  const { limit, offset } = parsePaging(req, 50, 100)
  res.json(getFollowing(target.id, limit, offset, viewerId).map((a) => publicProfile(a, viewerId)))
})

socialRouter.post('/api/follow', requireAuth, (req, res) => {
  const actor = req.account!
  const permission = canFollow(actor)
  if (!permission.ok) return res.status(403).json({ errors: { form: permission.reason } })

  const targetUsername = String(req.body?.username ?? '')
  const target = getAccountByUsername(targetUsername)
  if (!target) return res.status(404).json({ errors: { username: 'No account with that username.' } })
  if (target.id === actor.id) return res.status(422).json({ errors: { username: 'You cannot follow yourself.' } })
  if (isBlockedEitherWay(actor.id, target.id)) {
    return res.status(403).json({ errors: { username: 'You cannot follow this account.' } })
  }

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
