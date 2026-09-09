import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const dataDir = path.join(process.cwd(), 'server', '.data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(path.join(dataDir, 'prompt.sqlite'))
db.pragma('journal_mode = WAL')

// Usernames are shared across individual and organization accounts (one
// namespace), and both username and email are enforced unique at the
// database level via a unique index on a lowercase-normalized column —
// this is the actual constraint, not just an application-level check.
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_type TEXT NOT NULL CHECK (account_type IN ('individual', 'organization')),
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    first_name TEXT,
    organization_name TEXT,
    website_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_normalized ON accounts(username_normalized);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_normalized ON accounts(email_normalized);
`)
