import express from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import {
  normalizeEmail,
  normalizeUsername,
  validateSignupFields,
  validateUsernameFormat,
  type SignupInput,
} from '../shared/signupValidation.js'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT ?? 8787)

const findByUsername = db.prepare('SELECT 1 FROM accounts WHERE username_normalized = ?')
const findByEmail = db.prepare('SELECT 1 FROM accounts WHERE email_normalized = ?')
const insertAccount = db.prepare(`
  INSERT INTO accounts (
    id, account_type, username, username_normalized, email, email_normalized,
    password_hash, password_salt, first_name, organization_name, website_url, created_at
  ) VALUES (
    @id, @accountType, @username, @usernameNormalized, @email, @emailNormalized,
    @passwordHash, @passwordSalt, @firstName, @organizationName, @websiteUrl, @createdAt
  )
`)

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
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
    })
  } catch (err) {
    // Belt-and-suspenders: two signups for the same name/email racing past
    // the SELECT checks above both still hit this unique index, and only
    // one INSERT can win. Translate that DB-level rejection back into the
    // same field error the pre-check would have given.
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('idx_accounts_username_normalized')) {
      return res.status(422).json({ errors: { username: 'That username is already taken.' } })
    }
    if (message.includes('idx_accounts_email_normalized')) {
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
  })
})

app.listen(PORT, () => {
  console.log(`Signup API listening on http://localhost:${PORT}`)
})
