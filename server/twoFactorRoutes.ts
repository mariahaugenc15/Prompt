import { Router } from 'express'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { verifyPassword } from './passwordHash.js'
import { formatSecretForDisplay, otpauthUrl } from './totp.js'
import { confirmTotpSetup, disableTotp, isTotpEnabled, startTotpSetup } from './twoFactorRepo.js'

export const twoFactorRouter = Router()

const getPasswordRow = db.prepare('SELECT password_hash, password_salt FROM accounts WHERE id = ?')

// POST /api/me/2fa/setup — generates (or replaces) a pending secret. It
// isn't checked at login until /confirm succeeds, so an abandoned setup
// can't lock anyone out — but starting a new setup while already enabled is
// blocked, since overwriting a live secret without confirming the new one
// first would silently break login for an account that already relies on it.
twoFactorRouter.post('/api/me/2fa/setup', requireAuth, (req, res) => {
  const me = req.account!
  if (isTotpEnabled(me.id)) {
    return res.status(422).json({
      errors: { form: 'Two-factor authentication is already enabled. Disable it first to set up a new authenticator.' },
    })
  }
  const secret = startTotpSetup(me.id)
  res.json({ secret: formatSecretForDisplay(secret), otpauthUrl: otpauthUrl(secret, me.username) })
})

// POST /api/me/2fa/confirm { code } — verifies the pending secret and turns
// 2FA on, returning the one-time set of backup codes in plaintext. They are
// never retrievable again after this response — only their hashes are kept.
twoFactorRouter.post('/api/me/2fa/confirm', requireAuth, (req, res) => {
  const me = req.account!
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!code) return res.status(422).json({ errors: { code: 'Enter the 6-digit code from your authenticator app.' } })
  const backupCodes = confirmTotpSetup(me.id, code)
  if (!backupCodes) {
    return res.status(422).json({ errors: { code: 'That code is incorrect or expired. Try the current code from your app.' } })
  }
  res.json({ ok: true, backupCodes })
})

// POST /api/me/2fa/disable { password } — re-checks the password rather
// than trusting the current session alone: disabling 2FA is exactly what an
// attacker holding a stolen session (but not the password) would want to do.
twoFactorRouter.post('/api/me/2fa/disable', requireAuth, (req, res) => {
  const me = req.account!
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const row = getPasswordRow.get(me.id) as { password_hash: string; password_salt: string } | undefined
  if (!row || !password || !verifyPassword(password, row.password_salt, row.password_hash)) {
    return res.status(401).json({ errors: { password: 'Incorrect password.' } })
  }
  disableTotp(me.id)
  res.json({ ok: true })
})
