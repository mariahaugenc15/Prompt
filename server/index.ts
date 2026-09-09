import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { db } from './db.js'
import { socialRouter } from './socialRoutes.js'
import { promptRouter } from './promptRoutes.js'
import {
  normalizeEmail,
  normalizeUsername,
  validateSignupFields,
  validateUsernameFormat,
  type SignupInput,
} from '../shared/signupValidation.js'

const app = express()

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

// Proof media rides along as base64 data URLs (see src/lib/media.ts, which
// downscales before encoding) rather than multipart upload — fine for a
// prototype, so the body limit just needs headroom past the default 100kb.
app.use(express.json({ limit: '5mb' }))
app.use(socialRouter)
app.use(promptRouter)

const PORT = Number(process.env.PORT ?? 8787)

const findByUsername = db.prepare('SELECT 1 FROM accounts WHERE username_normalized = ?')
const findByEmail = db.prepare('SELECT 1 FROM accounts WHERE email_normalized = ?')
const findLoginRow = db.prepare(`
  SELECT id, account_type, username, email, first_name, organization_name, password_hash, password_salt
  FROM accounts WHERE username_normalized = ?
`)
const rotateToken = db.prepare('UPDATE accounts SET auth_token = ? WHERE id = ?')
const insertAccount = db.prepare(`
  INSERT INTO accounts (
    id, account_type, username, username_normalized, email, email_normalized,
    password_hash, password_salt, first_name, organization_name, website_url, created_at, auth_token
  ) VALUES (
    @id, @accountType, @username, @usernameNormalized, @email, @emailNormalized,
    @passwordHash, @passwordSalt, @firstName, @organizationName, @websiteUrl, @createdAt, @authToken
  )
`)

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  // Both sides are always a 64-byte scrypt digest, so the length check
  // above is just for timingSafeEqual's own precondition — it never
  // becomes a length-based side channel on the password itself.
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

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
      }
    | undefined) : undefined

  // Same generic error whether the username doesn't exist or the password
  // is wrong — telling them apart would let an attacker enumerate accounts.
  const invalid = () => res.status(401).json({ errors: { form: 'Incorrect username or password.' } })

  if (!row || !password) return invalid()
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return invalid()

  // Rotate the token on every login rather than reusing whatever was minted
  // at sign-up (or a previous login) — a fresh session per login, same as
  // any real auth system, even though there's no expiry yet (see README).
  const token = crypto.randomBytes(32).toString('hex')
  rotateToken.run(token, row.id)

  res.json({
    id: row.id,
    accountType: row.account_type,
    username: row.username,
    email: row.email,
    firstName: row.first_name ?? undefined,
    organizationName: row.organization_name ?? undefined,
    token,
  })
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
