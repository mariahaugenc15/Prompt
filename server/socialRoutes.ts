import { Router } from 'express'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { canFollow, type PromptPermission } from './permissions.js'
import { getAccountByUsername, publicProfile } from './accountsRepo.js'

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

socialRouter.get('/api/accounts/:username', (req, res) => {
  const target = getAccountByUsername(req.params.username)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })

  // Optional auth: an unauthenticated viewer still sees the public profile,
  // just without an isFollowing flag.
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const viewer = token ? (db.prepare('SELECT id FROM accounts WHERE auth_token = ?').get(token) as { id: string } | undefined) : undefined

  res.json(publicProfile(target, viewer?.id))
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
