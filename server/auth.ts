import type { NextFunction, Request, Response } from 'express'
import { db } from './db.js'
import type { AccountType, PromptPermission } from './permissions.js'

// v1 stand-in for real login/sessions: signup mints a random bearer token
// (server/index.ts) and the client sends it back on every subsequent
// request. There's no separate login-with-password flow yet (see README) —
// this is just enough of a session concept to make "enforced server-side"
// mean something. A real login form / rotating sessions is a natural
// follow-up, not implemented here.

export interface AuthedAccount {
  id: string
  accountType: AccountType
  username: string
  email: string
  promptPermission: PromptPermission
  displayName: string
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
}

const findByToken = db.prepare(
  'SELECT id, account_type, username, email, prompt_permission, first_name, organization_name FROM accounts WHERE auth_token = ?',
)

export function toAuthedAccount(row: AccountRow): AuthedAccount {
  return {
    id: row.id,
    accountType: row.account_type,
    username: row.username,
    email: row.email,
    promptPermission: row.prompt_permission,
    displayName: row.first_name ?? row.organization_name ?? row.username,
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
  return (findIdByToken.get(token) as { id: string } | undefined)?.id
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ errors: { form: 'Sign in required.' } })
  }
  const row = findByToken.get(token) as AccountRow | undefined
  if (!row) {
    return res.status(401).json({ errors: { form: 'Invalid or expired session.' } })
  }
  req.account = toAuthedAccount(row)
  next()
}
