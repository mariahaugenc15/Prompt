import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { hashPassword } from './passwordHash.js'
import { sendEmail } from './emailer.js'
import { deactivateAccount } from './accountsRepo.js'
import { createPendingLogin } from './pendingLoginRepo.js'
import { normalizeEmail, validatePassword } from '../shared/signupValidation.js'

export const authRouter = Router()

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60 // 1 hour
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '')

const findByEmail = db.prepare(
  'SELECT id, username, is_deleted FROM accounts WHERE email_normalized = ?',
)
const setResetToken = db.prepare('UPDATE accounts SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
const findByResetToken = db.prepare(
  'SELECT id, username, reset_token_expires, totp_enabled FROM accounts WHERE reset_token = ?',
)
const setNewPassword = db.prepare(`
  UPDATE accounts SET password_hash = ?, password_salt = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?
`)
const rotateAuthTokenAfterReset = db.prepare('UPDATE accounts SET auth_token = ?, auth_token_created_at = ? WHERE id = ?')
const getAccountForLoginResponse = db.prepare(
  'SELECT id, account_type, username, email, first_name, organization_name FROM accounts WHERE id = ?',
)

// POST /api/password-reset/request { email }
// Always responds the same way whether or not that email has an account —
// otherwise the response itself would let someone enumerate registered
// emails (same reasoning as the generic "incorrect username or password"
// on /api/login).
authRouter.post('/api/password-reset/request', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : ''
  const respondOk = () => res.json({ ok: true })
  if (!email) return respondOk()

  const account = findByEmail.get(normalizeEmail(email)) as { id: string; username: string; is_deleted: number } | undefined
  if (!account || account.is_deleted) return respondOk()

  const token = crypto.randomBytes(32).toString('hex')
  setResetToken.run(token, Date.now() + RESET_TOKEN_TTL_MS, account.id)

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`
  sendEmail(
    email,
    'Reset your Prompt password',
    `Hi @${account.username},\n\nSomeone (hopefully you) asked to reset your Prompt password. This link works for the next hour:\n\n${resetUrl}\n\nIf you didn't ask for this, you can ignore this email — your password hasn't changed.`,
  )

  respondOk()
})

// POST /api/password-reset/confirm { token, newPassword }
// Logs the account in immediately on success (rotates a fresh auth_token,
// same shape as /api/login's response) so there's no separate "now go log
// in again" step, and invalidates whatever session existed before —
// exactly what you'd want if the reset was prompted by a lost/stolen
// device. An account with 2FA enabled still has to clear that step here too
// — resetting the password proves control of the inbox, not the second
// factor, and skipping straight to a token would make a compromised inbox
// alone enough to walk around 2FA entirely.
authRouter.post('/api/password-reset/confirm', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''

  const passwordError = validatePassword(newPassword)
  if (passwordError) return res.status(422).json({ errors: { newPassword: passwordError } })

  const row = token
    ? (findByResetToken.get(token) as { id: string; username: string; reset_token_expires: number; totp_enabled: number } | undefined)
    : undefined
  if (!row || row.reset_token_expires < Date.now()) {
    return res.status(400).json({ errors: { form: 'That reset link is invalid or has expired. Request a new one.' } })
  }

  const { hash, salt } = hashPassword(newPassword)
  setNewPassword.run(hash, salt, row.id)

  if (row.totp_enabled) {
    return res.json({ requiresTotp: true, loginToken: createPendingLogin(row.id) })
  }

  const authToken = crypto.randomBytes(32).toString('hex')
  rotateAuthTokenAfterReset.run(authToken, Date.now(), row.id)

  const account = getAccountForLoginResponse.get(row.id) as {
    id: string
    account_type: string
    username: string
    email: string
    first_name: string | null
    organization_name: string | null
  }
  res.json({
    id: account.id,
    accountType: account.account_type,
    username: account.username,
    email: account.email,
    firstName: account.first_name ?? undefined,
    organizationName: account.organization_name ?? undefined,
    token: authToken,
  })
})

// POST /api/logout — the client already clears its own local state, but
// that leaves the token itself still valid until the next login rotates
// it. This invalidates it immediately, so "sign out" actually means
// something if the device is shared or the token leaked.
const rotateTokenAway = db.prepare('UPDATE accounts SET auth_token = ? WHERE id = ?')
authRouter.post('/api/logout', requireAuth, (req, res) => {
  rotateTokenAway.run(crypto.randomBytes(32).toString('hex'), req.account!.id)
  res.json({ ok: true })
})

// DELETE /api/me — soft delete. Anonymizes the display identity and blocks
// future login/auth, but keeps the row (and its id) intact so everything
// that references this account by id — prompts, completions, board
// ownership, follows — stays structurally valid for the other users who
// see it, rather than orphaning their data. Same operation an admin ban
// uses (see accountsRepo.ts's deactivateAccount).
authRouter.delete('/api/me', requireAuth, (req, res) => {
  deactivateAccount(req.account!.id)
  res.json({ ok: true })
})
