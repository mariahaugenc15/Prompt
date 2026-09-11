import { Router } from 'express'
import { requireAdmin, requireAuth } from './auth.js'
import { removeComment } from './commentsRepo.js'
import {
  adminBanAccount,
  adminGetAccount,
  adminGetComment,
  adminGetReport,
  adminListAccounts,
  adminListComments,
  adminListFeedback,
  adminListReports,
  adminReopenFeedback,
  adminReopenReport,
  adminResolveFeedback,
  adminResolveReport,
  adminSearchAccounts,
  adminUsageStats,
} from './adminRepo.js'

export const adminRouter = Router()

adminRouter.use('/api/admin', requireAuth, requireAdmin)

function pagination(req: import('express').Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  return { limit, offset }
}

function statusParam(req: import('express').Request): 'open' | 'resolved' {
  return req.query.status === 'resolved' ? 'resolved' : 'open'
}

// --- Usage stats -----------------------------------------------------------

adminRouter.get('/api/admin/stats', (_req, res) => {
  res.json(adminUsageStats())
})

// --- Accounts --------------------------------------------------------------

adminRouter.get('/api/admin/accounts', (req, res) => {
  const { limit, offset } = pagination(req)
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const rows = q ? adminSearchAccounts(q, limit, offset) : adminListAccounts(limit, offset)
  res.json(rows)
})

adminRouter.get('/api/admin/accounts/:id', (req, res) => {
  const row = adminGetAccount(String(req.params.id))
  if (!row) return res.status(404).json({ errors: { form: 'No account with that id.' } })
  res.json(row)
})

// Banning reuses the same anonymize-and-lock path a self-delete takes
// (accountsRepo.ts's deactivateAccount) — a ban is not a separate state,
// just the account being deactivated by someone other than its owner.
adminRouter.post('/api/admin/accounts/:id/ban', (req, res) => {
  const id = String(req.params.id)
  const target = adminGetAccount(id)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that id.' } })
  if (id === req.account!.id) return res.status(422).json({ errors: { form: 'You cannot ban your own account.' } })
  adminBanAccount(id)
  res.json({ ok: true })
})

// --- Reports -----------------------------------------------------------

adminRouter.get('/api/admin/reports', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(adminListReports(statusParam(req), limit, offset))
})

adminRouter.post('/api/admin/reports/:id/resolve', (req, res) => {
  const id = String(req.params.id)
  if (!adminGetReport(id)) return res.status(404).json({ errors: { form: 'No report with that id.' } })
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined
  adminResolveReport(id, req.account!.id, note || undefined)
  res.json({ ok: true })
})

adminRouter.post('/api/admin/reports/:id/reopen', (req, res) => {
  const id = String(req.params.id)
  if (!adminGetReport(id)) return res.status(404).json({ errors: { form: 'No report with that id.' } })
  adminReopenReport(id)
  res.json({ ok: true })
})

// --- Feedback ------------------------------------------------------------

adminRouter.get('/api/admin/feedback', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(adminListFeedback(statusParam(req), limit, offset))
})

adminRouter.post('/api/admin/feedback/:id/resolve', (req, res) => {
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined
  adminResolveFeedback(String(req.params.id), req.account!.id, note || undefined)
  res.json({ ok: true })
})

adminRouter.post('/api/admin/feedback/:id/reopen', (req, res) => {
  adminReopenFeedback(String(req.params.id))
  res.json({ ok: true })
})

// --- Comments (moderation) -------------------------------------------------

adminRouter.get('/api/admin/comments', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(adminListComments(limit, offset))
})

adminRouter.post('/api/admin/comments/:id/remove', (req, res) => {
  const id = String(req.params.id)
  if (!adminGetComment(id)) return res.status(404).json({ errors: { form: 'No comment with that id.' } })
  removeComment(id, req.account!.id)
  res.json({ ok: true })
})
