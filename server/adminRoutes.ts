import { Router } from 'express'
import { requireAdmin, requireAuth } from './auth.js'
import { removeComment } from './commentsRepo.js'
import { sendEmail } from './emailer.js'
import { publicBaseUrl } from './mediaStore.js'
import {
  adminAllAccounts,
  adminBanAccount,
  adminDeleteAccount,
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
  ensureBroadcastUnsubToken,
  listAuditLog,
  listBroadcastEmails,
  listBroadcastRecipients,
  recordAuditLog,
  recordBroadcastEmail,
  unsubscribeByToken,
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
    'completion_score', 'completion_completed', 'completion_total', 'prompts_sent', 'follower_count', 'created_at', 'last_active_date',
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
        csvCell(r.last_active_date),
      ].join(','),
    )
  }
  recordAuditLog({ adminAccountId: req.account!.id, action: 'export_accounts_csv', details: `${rows.length} accounts${accountType ? ` (${accountType})` : ''}` })
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
  recordAuditLog({ adminAccountId: req.account!.id, action: 'ban_account', targetAccountId: id, details: `@${target.username}` })
  res.json({ ok: true })
})

// Permanent delete — distinct from Ban above and irreversible. Requires
// typing the target's exact current username as a deliberate confirmation
// step (the client enforces this as a text field, but it's re-checked
// here too since the server is the real gate, not the UI). See
// accountsRepo.ts's permanentlyDeleteAccount for exactly what this does
// and doesn't remove.
adminRouter.post('/api/admin/accounts/:id/delete', (req, res) => {
  const id = String(req.params.id)
  const target = adminGetAccount(id)
  if (!target) return res.status(404).json({ errors: { form: 'No account with that id.' } })
  if (id === req.account!.id) return res.status(422).json({ errors: { form: 'You cannot delete your own account.' } })
  const confirmUsername = typeof req.body?.confirmUsername === 'string' ? req.body.confirmUsername.trim() : ''
  if (confirmUsername !== target.username) {
    return res.status(422).json({ errors: { confirmUsername: 'Type the exact username to confirm.' } })
  }
  adminDeleteAccount(id)
  recordAuditLog({ adminAccountId: req.account!.id, action: 'delete_account', targetAccountId: id, details: `@${target.username}` })
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

// --- Audit log ---------------------------------------------------------

adminRouter.get('/api/admin/audit-log', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(listAuditLog(limit, offset))
})

// --- Broadcast email ("contact all users") ----------------------------------

function broadcastBody(req: import('express').Request): { subject: string; body: string } | { error: string } {
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : ''
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
  if (!subject || !body) return { error: 'Subject and body are required.' }
  return { subject, body }
}

adminRouter.post('/api/admin/broadcast/test', async (req, res) => {
  const parsed = broadcastBody(req)
  if ('error' in parsed) return res.status(422).json({ errors: { form: parsed.error } })
  await sendEmail(req.account!.email, parsed.subject, parsed.body)
  recordAuditLog({ adminAccountId: req.account!.id, action: 'broadcast_test', details: parsed.subject })
  res.json({ ok: true })
})

const BROADCAST_BATCH_SIZE = 20
const BROADCAST_BATCH_DELAY_MS = 2000

// Fires after the response has already gone out (the admin shouldn't wait
// on hundreds of individual sends) — batched and rate-limited so this
// doesn't hammer the SMTP provider all at once. Each email gets its own
// unsubscribe link, generated lazily per recipient.
async function sendBroadcastBatched(
  recipients: { id: string; email: string }[],
  subject: string,
  body: string,
  baseUrl: string,
): Promise<void> {
  for (let i = 0; i < recipients.length; i += BROADCAST_BATCH_SIZE) {
    const batch = recipients.slice(i, i + BROADCAST_BATCH_SIZE)
    await Promise.all(
      batch.map((r) => {
        const unsubUrl = `${baseUrl}/api/broadcast/unsubscribe/${ensureBroadcastUnsubToken(r.id)}`
        return sendEmail(r.email, subject, `${body}\n\n---\nUnsubscribe from these emails: ${unsubUrl}`)
      }),
    )
    if (i + BROADCAST_BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BROADCAST_BATCH_DELAY_MS))
    }
  }
}

// The actual "confirm" gate: the admin panel UI has its own preview/confirm
// step, but this is the real one, since the server is the actual
// enforcement point per the app's own pattern — a crafted request still
// needs confirm: true, not just subject/body.
adminRouter.post('/api/admin/broadcast/send', (req, res) => {
  const parsed = broadcastBody(req)
  if ('error' in parsed) return res.status(422).json({ errors: { form: parsed.error } })
  if (req.body?.confirm !== true) {
    return res.status(422).json({ errors: { form: 'Confirmation is required to send a broadcast.' } })
  }
  const recipients = listBroadcastRecipients()
  const baseUrl = publicBaseUrl(req)
  const id = recordBroadcastEmail({ sentBy: req.account!.id, subject: parsed.subject, body: parsed.body, recipientCount: recipients.length })
  recordAuditLog({
    adminAccountId: req.account!.id,
    action: 'broadcast_send',
    details: `"${parsed.subject}" to ${recipients.length} recipients`,
  })
  res.json({ ok: true, id, recipientCount: recipients.length })
  void sendBroadcastBatched(recipients, parsed.subject, parsed.body, baseUrl)
})

adminRouter.get('/api/admin/broadcast/log', (req, res) => {
  const { limit, offset } = pagination(req)
  res.json(listBroadcastEmails(limit, offset))
})

// Public — reached from a link in the broadcast email itself, not from
// inside the app, so no auth. Same response whether the token is valid,
// already used, or junk, so it never leaks which is which.
adminRouter.get('/api/broadcast/unsubscribe/:token', (req, res) => {
  unsubscribeByToken(String(req.params.token))
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
      '<body style="font-family:system-ui,sans-serif;max-width:420px;margin:72px auto;padding:0 20px;text-align:center;color:#211f1c;">' +
      '<h1 style="font-size:1.3rem;">You\'re unsubscribed</h1>' +
      '<p>You won\'t get any more of these emails. You\'ll still get the in-app and push notifications you\'ve chosen in your Prompt settings.</p>' +
      '</body></html>',
  )
})
