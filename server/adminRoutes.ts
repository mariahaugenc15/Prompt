import { Router } from 'express'
import { requireAdmin, requireAuth } from './auth.js'
import { removeComment } from './commentsRepo.js'
import {
  adminAllAccounts,
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
  type AdminAccountRow,
} from './adminRepo.js'
import {
  adminApproveVerificationRequest,
  adminGetVerificationRequest,
  adminListVerificationRequests,
  adminRejectVerificationRequest,
  adminRevokeVerification,
  type VerificationStatus,
} from './verificationRepo.js'

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

function verificationStatusParam(req: import('express').Request): VerificationStatus {
  return req.query.status === 'approved' || req.query.status === 'rejected' ? req.query.status : 'pending'
}

// --- Usage stats -----------------------------------------------------------

adminRouter.get('/api/admin/stats', (_req, res) => {
  res.json(adminUsageStats())
})

// --- Accounts --------------------------------------------------------------

function accountTypeParam(req: import('express').Request): string | undefined {
  return req.query.type === 'individual' || req.query.type === 'organization' ? req.query.type : undefined
}

adminRouter.get('/api/admin/accounts', (req, res) => {
  const { limit, offset } = pagination(req)
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const accountType = accountTypeParam(req)
  const rows = q ? adminSearchAccounts(q, limit, offset, accountType) : adminListAccounts(limit, offset, accountType)
  res.json(rows)
})

// CSV export — every matching account in one response (no pagination) so an
// admin can pull the full signup list (emails included) into a spreadsheet.
function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

adminRouter.get('/api/admin/accounts/export.csv', (req, res) => {
  const accountType = accountTypeParam(req)
  const rows = adminAllAccounts(accountType)
  const header = [
    'username', 'email', 'account_type', 'name', 'is_verified', 'is_admin', 'is_deleted',
    'completion_score', 'completion_completed', 'completion_total', 'prompts_sent', 'follower_count', 'created_at',
  ]
  const lines = [header.join(',')]
  for (const r of rows as AdminAccountRow[]) {
    lines.push(
      [
        csvCell(r.username),
        csvCell(r.email),
        csvCell(r.account_type),
        csvCell(r.first_name ?? r.organization_name),
        csvCell(r.is_verified),
        csvCell(r.is_admin),
        csvCell(r.is_deleted),
        csvCell(r.completion_score),
        csvCell(r.completion_completed),
        csvCell(r.completion_total),
        csvCell(r.prompts_sent),
        csvCell(r.follower_count),
        csvCell(new Date(r.created_at).toISOString()),
      ].join(','),
    )
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="prompt-accounts.csv"')
  res.send(lines.join('\n'))
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

// Independent of any specific verification_requests row — for taking a
// verified badge back after the fact (misuse, no longer eligible), not just
// at the moment of reviewing a request.
adminRouter.post('/api/admin/accounts/:id/revoke-verification', (req, res) => {
  const id = String(req.params.id)
  if (!adminGetAccount(id)) return res.status(404).json({ errors: { form: 'No account with that id.' } })
  adminRevokeVerification(id)
  res.json({ ok: true })
})

// --- Verification requests --------------------------------------------------

adminRouter.get('/api/admin/verification-requests', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(adminListVerificationRequests(verificationStatusParam(req), limit, offset))
})

adminRouter.post('/api/admin/verification-requests/:id/approve', (req, res) => {
  const id = String(req.params.id)
  const request = adminGetVerificationRequest(id)
  if (!request) return res.status(404).json({ errors: { form: 'No verification request with that id.' } })
  if (request.status !== 'pending') return res.status(422).json({ errors: { form: 'This request has already been reviewed.' } })
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined
  adminApproveVerificationRequest(id, request.account_id, req.account!.id, note || undefined)
  res.json({ ok: true })
})

adminRouter.post('/api/admin/verification-requests/:id/reject', (req, res) => {
  const id = String(req.params.id)
  const request = adminGetVerificationRequest(id)
  if (!request) return res.status(404).json({ errors: { form: 'No verification request with that id.' } })
  if (request.status !== 'pending') return res.status(422).json({ errors: { form: 'This request has already been reviewed.' } })
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined
  adminRejectVerificationRequest(id, req.account!.id, note || undefined)
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
