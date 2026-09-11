import type { NextFunction, Request, Response } from 'express'
import { db } from './db.js'
import { recordActivity } from './activityRepo.js'
import type { AccountType, PromptPermission } from './permissions.js'

// Bearer-token sessions: signup and login (server/index.ts) each mint a
// random token, and the client sends it back on every subsequent request.
// One token per account at a time — logging in elsewhere overwrites the
// old one, and /api/logout (authRoutes.ts) rotates it away explicitly.
// MAX_TOKEN_AGE_MS below forces re-login periodically even without either
// of those happening.

export interface AuthedAccount {
  id: string
  accountType: AccountType
  username: string
  email: string
  promptPermission: PromptPermission
  displayName: string
  isAdmin: boolean
  isVerified: boolean
  totpEnabled: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    account?: AuthedAccount
  }
}

interface AccountRow {
  id: string
  account_type: AccountType
  username: string
  email: string
  prompt_permission: PromptPermission
  first_name: string | null
  organization_name: string | null
  is_admin: number
  is_verified: number
  totp_enabled: number
}

const findByToken = db.prepare(
  `SELECT id, account_type, username, email, prompt_permission, first_name, organization_name, is_admin, is_verified, totp_enabled, auth_token_created_at, is_deleted
   FROM accounts WHERE auth_token = ?`,
)

// Read fresh on every call rather than cached once at import time: on a
// deployment with no persistent disk, every restart wipes accounts.is_admin
// along with everything else, so granting admin access by only writing that
// column at boot (see db.ts's ADMIN_USERNAMES bootstrap) creates a
// chicken-and-egg problem — the account has to exist before the restart
// that would flag it, and a restart on such a deployment deletes the
// account itself. Checking the env var live sidesteps that entirely: it
// takes effect immediately for any matching account, no restart required,
// with or without a disk. The persisted column still matters wherever a
// disk exists and an admin is later granted through means other than this
// env var (e.g. a future "make admin" dashboard action).
function isAdminByEnv(username: string): boolean {
  const normalized = username.trim().toLowerCase()
  return (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized)
}

// A token never had an expiry until this pass — sessions are otherwise
// valid forever, which is fine for a one-token-per-account model where
// logging in elsewhere already invalidates the old one, but a lost/leaked
// token would stay usable indefinitely. This forces re-login periodically
// without needing full refresh-token infrastructure.
const MAX_TOKEN_AGE_MS = 1000 * 60 * 60 * 24 * 90

export function toAuthedAccount(row: AccountRow): AuthedAccount {
  return {
    id: row.id,
    accountType: row.account_type,
    username: row.username,
    email: row.email,
    promptPermission: row.prompt_permission,
    displayName: row.first_name ?? row.organization_name ?? row.username,
    isAdmin: Boolean(row.is_admin) || isAdminByEnv(row.username),
    isVerified: Boolean(row.is_verified),
    totpEnabled: Boolean(row.totp_enabled),
  }
}

const findIdByToken = db.prepare('SELECT id FROM accounts WHERE auth_token = ?')

// Same bearer-token lookup as requireAuth, but tolerant of a missing or
// invalid token — several read-only routes show public data to anyone,
// just personalized (an isFollowing/isSubscribed flag) when the caller
// happens to be signed in.
export function resolveOptionalAccountId(req: Request): string | undefined {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return undefined
  const id = (findIdByToken.get(token) as { id: string } | undefined)?.id
  if (id) recordActivity(id)
  return id
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ errors: { form: 'Sign in required.' } })
  }
  const row = findByToken.get(token) as (AccountRow & { auth_token_created_at: number | null; is_deleted: number }) | undefined
  if (!row || row.is_deleted) {
    return res.status(401).json({ errors: { form: 'Invalid or expired session.' } })
  }
  if (row.auth_token_created_at && Date.now() - row.auth_token_created_at > MAX_TOKEN_AGE_MS) {
    return res.status(401).json({ errors: { form: 'Your session has expired. Please log in again.' } })
  }
  req.account = toAuthedAccount(row)
  recordActivity(row.id)
  next()
}

// Chain after requireAuth on any /api/admin/* route. Being an admin is a
// property of the account (accounts.is_admin, set via the ADMIN_USERNAMES
// bootstrap in db.ts — see there), not a separate credential, so this is
// just requireAuth plus one more check rather than a whole second auth path.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.account?.isAdmin) {
    return res.status(403).json({ errors: { form: 'Admin access required.' } })
  }
  next()
}
