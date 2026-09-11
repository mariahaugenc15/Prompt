import { db } from './db.js'
import {
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  hashBackupCodes,
  matchBackupCode,
  type HashedBackupCode,
} from './totp.js'

interface TotpRow {
  totp_secret: string | null
  totp_enabled: number
  totp_backup_codes: string | null
}

const getRow = db.prepare('SELECT totp_secret, totp_enabled, totp_backup_codes FROM accounts WHERE id = ?')
const setSecretStmt = db.prepare('UPDATE accounts SET totp_secret = ? WHERE id = ?')
const enableStmt = db.prepare('UPDATE accounts SET totp_enabled = 1, totp_backup_codes = ? WHERE id = ?')
const setBackupCodesStmt = db.prepare('UPDATE accounts SET totp_backup_codes = ? WHERE id = ?')
// Disabling 2FA also clears verification (accounts.is_verified) — being
// verified requires 2FA (see verificationRoutes.ts), so turning 2FA off
// can't leave a verified badge standing on protection that's now gone.
const disableStmt = db.prepare(`
  UPDATE accounts SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL, is_verified = 0 WHERE id = ?
`)

export function isTotpEnabled(accountId: string): boolean {
  const row = getRow.get(accountId) as TotpRow | undefined
  return Boolean(row?.totp_enabled)
}

// Stores a fresh secret without enabling it — login keeps using whatever
// was already confirmed (if anything) until confirmTotpSetup succeeds.
export function startTotpSetup(accountId: string): string {
  const secret = generateTotpSecret()
  setSecretStmt.run(secret, accountId)
  return secret
}

// Returns the plaintext backup codes on success (shown to the user exactly
// once), or null if the code didn't match the pending secret.
export function confirmTotpSetup(accountId: string, code: string): string[] | null {
  const row = getRow.get(accountId) as TotpRow | undefined
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, code)) return null
  const backupCodes = generateBackupCodes()
  enableStmt.run(JSON.stringify(hashBackupCodes(backupCodes)), accountId)
  return backupCodes
}

export function disableTotp(accountId: string): void {
  disableStmt.run(accountId)
}

export type LoginFactorResult = 'totp' | 'backup' | null

// Tried in order: a live TOTP code first, then a one-time backup code
// (consumed on match, so it can't be reused).
export function verifyLoginFactor(accountId: string, code: string): LoginFactorResult {
  const row = getRow.get(accountId) as TotpRow | undefined
  if (!row?.totp_enabled || !row.totp_secret) return null
  if (verifyTotp(row.totp_secret, code)) return 'totp'
  if (row.totp_backup_codes) {
    const hashed = JSON.parse(row.totp_backup_codes) as HashedBackupCode[]
    const idx = matchBackupCode(code, hashed)
    if (idx !== -1) {
      hashed.splice(idx, 1)
      setBackupCodesStmt.run(JSON.stringify(hashed), accountId)
      return 'backup'
    }
  }
  return null
}
