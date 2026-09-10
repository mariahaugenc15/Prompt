import { db } from './db.js'
import type { AccountType, PromptPermission } from './permissions.js'

export interface AccountRow {
  id: string
  account_type: AccountType
  username: string
  email: string
  prompt_permission: PromptPermission
  first_name: string | null
  organization_name: string | null
  website_url: string | null
}

const byId = db.prepare(
  'SELECT id, account_type, username, email, prompt_permission, first_name, organization_name, website_url FROM accounts WHERE id = ?',
)
const byUsername = db.prepare(
  'SELECT id, account_type, username, email, prompt_permission, first_name, organization_name, website_url FROM accounts WHERE username_normalized = ?',
)
const searchStmt = db.prepare(`
  SELECT id, account_type, username, email, prompt_permission, first_name, organization_name, website_url
  FROM accounts
  WHERE (username_normalized LIKE ? ESCAPE '\\'
      OR LOWER(first_name) LIKE ? ESCAPE '\\'
      OR LOWER(organization_name) LIKE ? ESCAPE '\\')
    AND id != ?
  ORDER BY username_normalized ASC
  LIMIT ?
`)
const followRow = db.prepare('SELECT 1 FROM follows WHERE follower_account_id = ? AND followee_account_id = ?')
const followerCountStmt = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_account_id = ?')
const followingCountStmt = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_account_id = ?')

export function getAccountById(id: string): AccountRow | undefined {
  return byId.get(id) as AccountRow | undefined
}

export function getAccountByUsername(username: string): AccountRow | undefined {
  return byUsername.get(username.trim().toLowerCase()) as AccountRow | undefined
}

// % and _ are SQL LIKE wildcards — escape them so a search for e.g. "j_doe"
// only matches that literal string, not "j" + any-character + "doe".
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}

export function searchAccounts(query: string, excludeAccountId: string | undefined, limit: number): AccountRow[] {
  const like = `%${escapeLike(query.trim().toLowerCase())}%`
  return searchStmt.all(like, like, like, excludeAccountId ?? '', limit) as AccountRow[]
}

export function isFollowing(followerId: string, followeeId: string): boolean {
  return Boolean(followRow.get(followerId, followeeId))
}

export function followerCount(accountId: string): number {
  return (followerCountStmt.get(accountId) as { n: number }).n
}

export function followingCount(accountId: string): number {
  return (followingCountStmt.get(accountId) as { n: number }).n
}

export function displayName(account: Pick<AccountRow, 'first_name' | 'organization_name' | 'username'>): string {
  return account.first_name ?? account.organization_name ?? account.username
}

export function publicProfile(account: AccountRow, viewerId?: string) {
  return {
    id: account.id,
    username: account.username,
    accountType: account.account_type,
    displayName: displayName(account),
    websiteUrl: account.website_url ?? undefined,
    followerCount: followerCount(account.id),
    followingCount: followingCount(account.id),
    isFollowing: viewerId ? isFollowing(viewerId, account.id) : undefined,
  }
}
