import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import { db } from './db.js'
import { socialRouter } from './socialRoutes.js'
import { promptRouter } from './promptRoutes.js'
import { boardsRouter } from './boardsRoutes.js'
import { calendarsRouter } from './calendarsRoutes.js'
import { feedRouter } from './feedRoutes.js'
import { pushRouter } from './pushRoutes.js'
import { authRouter } from './authRoutes.js'
import { moderationRouter } from './moderationRoutes.js'
import { commentsRouter } from './commentsRoutes.js'
import { feedbackRouter } from './feedbackRoutes.js'
import { adminRouter } from './adminRoutes.js'
import { twoFactorRouter } from './twoFactorRoutes.js'
import { verificationRouter } from './verificationRoutes.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mediaDir } from './mediaStore.js'
import { hashPassword, verifyPassword } from './passwordHash.js'
import { verifyLoginFactor } from './twoFactorRepo.js'
import { consumePendingLogin, createPendingLogin, peekPendingLogin } from './pendingLoginRepo.js'
import {
  normalizeEmail,
  normalizeUsername,
  validateSignupFields,
  validateUsernameFormat,
  type SignupInput,
} from '../shared/signupValidation.js'

const app = express()

// Render (and most PaaS hosts) terminate TLS at their own proxy and forward
// plain HTTP internally, so without this, req.protocol always reports
// "http" even when the public request was https — which would make
// mediaStore.ts's publicBaseUrl() build media URLs with the wrong scheme.
// It also makes express-rate-limit key off the real client IP (X-Forwarded-
// For) instead of the proxy's own IP for every request.
app.set('trust proxy', 1)

// The frontend and this API are meant to live on different hosts in
// production (e.g. the frontend on Vercel, this on Render/Railway/Fly —
// see README "Deploying"), so requests are cross-origin, not same-origin
// via the dev-only Vite proxy. Auth here is a bearer token in a header,
// never a cookie, so a permissive default doesn't expose anything a
// caller couldn't already do by holding that token directly — but set
// CORS_ORIGIN (comma-separated) to your real frontend URL(s) once you
// have one, rather than leaving this wide open indefinitely.
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }))

// Proof media rides along as base64 data URLs (see src/lib/media.ts) rather
// than multipart upload — fine for a prototype. Photos are downscaled
// before encoding so stay small, but video can't be re-encoded in the
// browser, so it rides at up to media.ts's MAX_VIDEO_BYTES (8MB) — base64
// inflates that by ~1/3, so the limit needs headroom past that, not just
// past the default 100kb.
app.use(express.json({ limit: '12mb' }))

// A moderate ceiling on every route — cheap insurance against a runaway
// client or a scripted abuse attempt, without getting in the way of normal
// use (polling every 15s, browsing feeds). A tighter limiter below layers
// on top of this for the specific routes that matter most (credential
// guessing, account-creation spam).
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: { form: 'Too many attempts. Please wait a while and try again.' } },
})
app.use('/api/signup', authLimiter)
app.use('/api/login', authLimiter)
app.use('/api/password-reset', authLimiter)
// Also gates 2FA code-guessing: 20 attempts / 15 min is as tight a leash on
// brute-forcing a 6-digit TOTP code as it is on a password.
app.use('/api/login/totp', authLimiter)

// Proof photos/videos and avatars saved by mediaStore.ts (see there for why
// this needs to be this server's own absolute URL, not a relative path).
app.use('/media', express.static(mediaDir, { maxAge: '30d', immutable: true }))

app.use(socialRouter)
app.use(promptRouter)
app.use(boardsRouter)
app.use(calendarsRouter)
app.use(feedRouter)
app.use(pushRouter)
app.use(authRouter)
app.use(moderationRouter)
app.use(commentsRouter)
app.use(feedbackRouter)
app.use(adminRouter)
app.use(twoFactorRouter)
app.use(verificationRouter)

// Self-contained admin dashboard (no build step) — served as a static file
// rather than part of the Vite frontend, since it's a separate audience
// (the app owner, not end users) with its own login gate (requireAdmin).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'adminPanel.html'))
})

const PORT = Number(process.env.PORT ?? 8787)

const findByUsername = db.prepare('SELECT 1 FROM accounts WHERE username_normalized = ?')
const findByEmail = db.prepare('SELECT 1 FROM accounts WHERE email_normalized = ?')
const findLoginRow = db.prepare(`
  SELECT id, account_type, username, email, first_name, organization_name, password_hash, password_salt, is_deleted, totp_enabled
  FROM accounts WHERE username_normalized = ?
`)
const findAccountForLoginResponse = db.prepare(`
  SELECT id, account_type, username, email, first_name, organization_name FROM accounts WHERE id = ?
`)
const rotateToken = db.prepare('UPDATE accounts SET auth_token = ?, auth_token_created_at = ? WHERE id = ?')
const insertAccount = db.prepare(`
  INSERT INTO accounts (
    id, account_type, username, username_normalized, email, email_normalized,
    password_hash, password_salt, first_name, organization_name, website_url, created_at, auth_token, auth_token_created_at
  ) VALUES (
    @id, @accountType, @username, @usernameNormalized, @email, @emailNormalized,
    @passwordHash, @passwordSalt, @firstName, @organizationName, @websiteUrl, @createdAt, @authToken, @createdAt
  )
`)

function usernameTaken(username: string): boolean {
  return Boolean(findByUsername.get(normalizeUsername(username)))
}

function emailTaken(email: string): boolean {
  return Boolean(findByEmail.get(normalizeEmail(email)))
}

// GET /api/signup/check-username?username=foo
// Backs the real-time (debounced client-side) availability check. This is
// a convenience for UX only — the POST below re-checks and is the actual
// gate, since a client-side "available" response can go stale the instant
// someone else takes the name.
app.get('/api/signup/check-username', (req, res) => {
  const username = String(req.query.username ?? '')
  const formatError = validateUsernameFormat(username)
  if (formatError) {
    return res.json({ available: false, error: formatError })
  }
  res.json({ available: !usernameTaken(username) })
})

app.post('/api/signup', (req, res) => {
  const input = req.body as Partial<SignupInput> & { accountType?: string }

  if (input.accountType !== 'individual' && input.accountType !== 'organization') {
    return res.status(400).json({ errors: { accountType: 'Account type must be "individual" or "organization".' } })
  }

  // Never trust the client's own validation or its earlier availability
  // check — re-run format validation and uniqueness here from scratch.
  const errors = validateSignupFields(input as SignupInput)

  if (!errors.username && usernameTaken(input.username!)) {
    errors.username = 'That username is already taken.'
  }
  if (!errors.email && emailTaken(input.email!)) {
    errors.email = 'An account with that email already exists.'
  }

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ errors })
  }

  const { hash, salt } = hashPassword(input.password!)
  const id = crypto.randomUUID()
  const authToken = crypto.randomBytes(32).toString('hex')

  try {
    insertAccount.run({
      id,
      accountType: input.accountType,
      username: input.username!.trim(),
      usernameNormalized: normalizeUsername(input.username!),
      email: input.email!.trim(),
      emailNormalized: normalizeEmail(input.email!),
      passwordHash: hash,
      passwordSalt: salt,
      firstName: input.accountType === 'individual' ? (input as { firstName: string }).firstName.trim() : null,
      organizationName:
        input.accountType === 'organization' ? (input as { organizationName: string }).organizationName.trim() : null,
      websiteUrl: input.accountType === 'organization' ? (input as { websiteUrl: string }).websiteUrl.trim() : null,
      createdAt: Date.now(),
      authToken,
    })
  } catch (err) {
    // Belt-and-suspenders: two signups for the same name/email racing past
    // the SELECT checks above both still hit this unique index, and only
    // one INSERT can win. Translate that DB-level rejection back into the
    // same field error the pre-check would have given. SQLite's error
    // message names the table.column(s), not the index — never the index
    // name, even when the constraint was declared as a named index.
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('accounts.username_normalized')) {
      return res.status(422).json({ errors: { username: 'That username is already taken.' } })
    }
    if (message.includes('accounts.email_normalized')) {
      return res.status(422).json({ errors: { email: 'An account with that email already exists.' } })
    }
    console.error('signup insert failed', err)
    return res.status(500).json({ errors: { form: 'Something went wrong. Please try again.' } })
  }

  res.status(201).json({
    id,
    accountType: input.accountType,
    username: input.username!.trim(),
    email: input.email!.trim(),
    firstName: input.accountType === 'individual' ? (input as { firstName: string }).firstName.trim() : undefined,
    organizationName:
      input.accountType === 'organization' ? (input as { organizationName: string }).organizationName.trim() : undefined,
    // v1 stand-in for a real session (see server/auth.ts) — the client
    // sends this back as `Authorization: Bearer <token>` on every
    // account/prompt request from here on.
    token: authToken,
  })
})

// Shared by the normal /api/login success path and /api/login/totp — issues
// a fresh session the same way either time, so a 2FA-protected login ends
// up identical to a non-2FA one from here on.
function issueLoginResponse(accountId: string) {
  const account = findAccountForLoginResponse.get(accountId) as {
    id: string
    account_type: SignupInput['accountType']
    username: string
    email: string
    first_name: string | null
    organization_name: string | null
  }
  const token = crypto.randomBytes(32).toString('hex')
  rotateToken.run(token, Date.now(), account.id)
  return {
    id: account.id,
    accountType: account.account_type,
    username: account.username,
    email: account.email,
    firstName: account.first_name ?? undefined,
    organizationName: account.organization_name ?? undefined,
    token,
  }
}

app.post('/api/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const row = username ? (findLoginRow.get(normalizeUsername(username)) as
    | {
        id: string
        account_type: SignupInput['accountType']
        username: string
        email: string
        first_name: string | null
        organization_name: string | null
        password_hash: string
        password_salt: string
        is_deleted: number
        totp_enabled: number
      }
    | undefined) : undefined

  // Same generic error whether the username doesn't exist or the password
  // is wrong — telling them apart would let an attacker enumerate accounts.
  const invalid = () => res.status(401).json({ errors: { form: 'Incorrect username or password.' } })

  if (!row || !password || row.is_deleted) return invalid()
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return invalid()

  // A correct password on a 2FA-enabled account doesn't get a token yet —
  // it gets a short-lived hand-off id, and the client makes one more call
  // (with a TOTP or backup code) to actually finish logging in.
  if (row.totp_enabled) {
    return res.json({ requiresTotp: true, loginToken: createPendingLogin(row.id) })
  }

  res.json(issueLoginResponse(row.id))
})

// POST /api/login/totp { loginToken, code } — the second step for a
// password that checked out on a 2FA-enabled account. loginToken proves the
// password step already succeeded (server/pendingLoginRepo.ts); code is
// either the current 6-digit app code or an unused backup code.
app.post('/api/login/totp', (req, res) => {
  const loginToken = typeof req.body?.loginToken === 'string' ? req.body.loginToken : ''
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  const invalid = () => res.status(401).json({ errors: { form: 'That code is incorrect or this login has expired. Try logging in again.' } })

  const pending = loginToken ? peekPendingLogin(loginToken) : undefined
  if (!pending || !code) return invalid()

  const factor = verifyLoginFactor(pending.accountId, code)
  if (!factor) return invalid()

  consumePendingLogin(loginToken)
  res.json(issueLoginResponse(pending.accountId))
})

// Last-resort handler: an unexpected error anywhere in a route should still
// come back as the same JSON error shape the client expects, not Express's
// default HTML stack trace page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('unhandled error', err)
  res.status(500).json({ errors: { form: 'Something went wrong. Please try again.' } })
})

app.listen(PORT, () => {
  console.log(`Signup API listening on http://localhost:${PORT}`)
})
