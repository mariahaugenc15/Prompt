import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { getAccountById, getAccountByUsername, publicProfile } from './accountsRepo.js'
import { block, blockedByMe, unblock } from './blocksRepo.js'

export const moderationRouter = Router()

moderationRouter.post('/api/block/:username', requireAuth, (req, res) => {
  const me = req.account!
  const target = getAccountByUsername(String(req.params.username))
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  if (target.id === me.id) return res.status(422).json({ errors: { form: 'You cannot block yourself.' } })
  block(me.id, target.id)
  res.status(201).json({ blocked: true })
})

moderationRouter.delete('/api/block/:username', requireAuth, (req, res) => {
  const me = req.account!
  const target = getAccountByUsername(String(req.params.username))
  if (!target) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  unblock(me.id, target.id)
  res.json({ blocked: false })
})

moderationRouter.get('/api/me/blocked', requireAuth, (req, res) => {
  const me = req.account!
  const profiles = blockedByMe(me.id)
    .map((id) => getAccountById(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => publicProfile(a, me.id))
  res.json(profiles)
})

const REPORT_TARGET_TYPES = ['account', 'completion', 'board', 'comment']
const insertReport = db.prepare(`
  INSERT INTO reports (id, reporter_account_id, reporter_email, target_type, target_id, reason, created_at)
  VALUES (@id, @reporterAccountId, @reporterEmail, @targetType, @targetId, @reason, @createdAt)
`)

// reporter_email always comes from the authenticated account, never the
// request body — the whole point is a real, verified address the admin
// dashboard can follow up on, not whatever a client happens to send.
moderationRouter.post('/api/report', requireAuth, (req, res) => {
  const me = req.account!
  const targetType = String(req.body?.targetType ?? '')
  const targetId = String(req.body?.targetId ?? '').trim()
  const reason = String(req.body?.reason ?? '').trim()

  if (!REPORT_TARGET_TYPES.includes(targetType)) {
    return res.status(422).json({ errors: { targetType: `Must be one of: ${REPORT_TARGET_TYPES.join(', ')}.` } })
  }
  if (!targetId) return res.status(422).json({ errors: { targetId: 'targetId is required.' } })
  if (!reason) return res.status(422).json({ errors: { reason: 'Please describe the issue.' } })

  insertReport.run({
    id: crypto.randomUUID(),
    reporterAccountId: me.id,
    reporterEmail: me.email,
    targetType,
    targetId,
    reason,
    createdAt: Date.now(),
  })
  res.status(201).json({ ok: true })
})
