import { db } from './db.js'
import type { AccountType, PromptPermission } from './permissions.js'
import { blockedEitherWayIds, isBlockedByViewer } from './blocksRepo.js'

export interface AccountRow {
  id: string
  account_type: AccountType
  username: string
  email: string
  prompt_permission: PromptPermission
  first_name: string | null
  organization_name: string | null
  website_url: string | null
  avatar_path: string | null
  bio: string | null
  is_verified: number
  profile_visibility: 'public' | 'private'
}

const ACCOUNT_COLUMNS =
  'id, account_type, username, email, prompt_permission, first_name, organization_name, website_url, avatar_path, bio, is_verified, profile_visibility'
const ACCOUNT_COLUMNS_A = ACCOUNT_COLUMNS.split(', ').map((c) => `a.${c}`).join(', ')

const byId = db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`)
const byUsername = db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE username_normalized = ? AND is_deleted = 0`)
const searchStmt = db.prepare(`
  SELECT ${ACCOUNT_COLUMNS}
  FROM accounts
  WHERE (username_normalized LIKE ? ESCAPE '\\'
      OR LOWER(first_name) LIKE ? ESCAPE '\\'
      OR LOWER(organization_name) LIKE ? ESCAPE '\\')
    AND id != ? AND is_deleted = 0
  ORDER BY username_normalized ASC
  LIMIT ? OFFSET ?
`)
const listStmt = db.prepare(`
  SELECT ${ACCOUNT_COLUMNS}
  FROM accounts
  WHERE id != ? AND is_deleted = 0
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`)
const followRow = db.prepare('SELECT 1 FROM follows WHERE follower_account_id = ? AND followee_account_id = ?')
const followerCountStmt = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_account_id = ?')
const followingCountStmt = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_account_id = ?')
const followersListStmt = db.prepare(`
  SELECT ${ACCOUNT_COLUMNS_A}
  FROM accounts a JOIN follows f ON f.follower_account_id = a.id
  WHERE f.followee_account_id = ? AND a.is_deleted = 0
  ORDER BY f.created_at DESC
  LIMIT ? OFFSET ?
`)
const followingListStmt = db.prepare(`
  SELECT ${ACCOUNT_COLUMNS_A}
  FROM accounts a JOIN follows f ON f.followee_account_id = a.id
  WHERE f.follower_account_id = ? AND a.is_deleted = 0
  ORDER BY f.created_at DESC
  LIMIT ? OFFSET ?
`)

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

// excludeAccountId doubles as the viewer when a caller is signed in — used
// to filter out anyone with a block relationship (either direction) with
// them, so a blocked account stops surfacing to the person who blocked it
// and vice versa.
function filterBlocked<T extends { id: string }>(rows: T[], viewerId: string | undefined): T[] {
  if (!viewerId) return rows
  const blocked = blockedEitherWayIds(viewerId)
  return blocked.size === 0 ? rows : rows.filter((r) => !blocked.has(r.id))
}

export function searchAccounts(query: string, excludeAccountId: string | undefined, limit: number, offset = 0): AccountRow[] {
  const like = `%${escapeLike(query.trim().toLowerCase())}%`
  const rows = searchStmt.all(like, like, like, excludeAccountId ?? '', limit, offset) as AccountRow[]
  return filterBlocked(rows, excludeAccountId)
}

// Every real account, most recently signed-up first — backs Explore's
// profile grid so a real person is discoverable there too, not only via a
// direct-name search.
export function listAccounts(excludeAccountId: string | undefined, limit: number, offset = 0): AccountRow[] {
  const rows = listStmt.all(excludeAccountId ?? '', limit, offset) as AccountRow[]
  return filterBlocked(rows, excludeAccountId)
}

// People you may know: accounts followed by accounts you follow (mutuals
// of your mutuals), excluding yourself and anyone you already follow.
// Falls back to the most recently-joined accounts when that graph walk
// comes up short (a brand-new account, or one that follows nobody yet).
const suggestionsFromNetworkStmt = db.prepare(`
  SELECT DISTINCT ${ACCOUNT_COLUMNS_A}
  FROM accounts a
  JOIN follows f2 ON f2.followee_account_id = a.id
  WHERE f2.follower_account_id IN (SELECT followee_account_id FROM follows WHERE follower_account_id = ?)
    AND a.id != ? AND a.is_deleted = 0
    AND a.id NOT IN (SELECT followee_account_id FROM follows WHERE follower_account_id = ?)
  LIMIT ?
`)

export function suggestedAccounts(accountId: string, limit: number): AccountRow[] {
  const fromNetwork = filterBlocked(suggestionsFromNetworkStmt.all(accountId, accountId, accountId, limit) as AccountRow[], accountId)
  if (fromNetwork.length >= limit) return fromNetwork
  const seen = new Set([accountId, ...fromNetwork.map((a) => a.id)])
  const fallback = filterBlocked(listStmt.all(accountId, limit, 0) as AccountRow[], accountId).filter(
    (a) => !seen.has(a.id) && !isFollowing(accountId, a.id),
  )
  return [...fromNetwork, ...fallback].slice(0, limit)
}

export function isFollowing(followerId: string, followeeId: string): boolean {
  return Boolean(followRow.get(followerId, followeeId))
}

// The people who follow this account, and the people this account follows —
// the follow graph is otherwise a dead end (a count with nothing to click
// into), so there was no way to browse from one profile to the next.
export function getFollowers(accountId: string, limit: number, offset = 0, viewerId?: string): AccountRow[] {
  return filterBlocked(followersListStmt.all(accountId, limit, offset) as AccountRow[], viewerId)
}

export function getFollowing(accountId: string, limit: number, offset = 0, viewerId?: string): AccountRow[] {
  return filterBlocked(followingListStmt.all(accountId, limit, offset) as AccountRow[], viewerId)
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

// The one gate for whether a viewer gets to see this account's completed-
// prompt calendar: always true for a public profile, otherwise only the
// account itself or someone who follows it. No per-completion or
// per-calendar override on top of this — see server/db.ts's
// profile_visibility comment.
export function canViewProfileActivity(account: AccountRow, viewerId?: string): boolean {
  if (account.profile_visibility !== 'private') return true
  if (!viewerId) return false
  if (viewerId === account.id) return true
  return isFollowing(viewerId, account.id)
}

export function publicProfile(account: AccountRow, viewerId?: string) {
  return {
    id: account.id,
    username: account.username,
    accountType: account.account_type,
    displayName: displayName(account),
    websiteUrl: account.website_url ?? undefined,
    avatarUrl: account.avatar_path ?? undefined,
    bio: account.bio ?? undefined,
    followerCount: followerCount(account.id),
    followingCount: followingCount(account.id),
    isFollowing: viewerId ? isFollowing(viewerId, account.id) : undefined,
    blockedByMe: viewerId ? isBlockedByViewer(viewerId, account.id) : undefined,
    isVerified: Boolean(account.is_verified),
    profileVisibility: account.profile_visibility,
    canViewActivity: canViewProfileActivity(account, viewerId),
  }
}

// Soft-deactivates an account: anonymizes the display identity and blocks
// future login/auth, but keeps the row (and its id) intact so everything
// that references this account by id — prompts, completions, board
// ownership, follows — stays structurally valid for the other users who
// see it, rather than orphaning their data. Used both for a user deleting
// their own account (authRoutes.ts) and an admin banning one
// (adminRoutes.ts) — same operation either way, just who triggers it.
const deactivateStmt = db.prepare(`
  UPDATE accounts
  SET is_deleted = 1, deleted_at = ?, auth_token = NULL, first_name = NULL, organization_name = NULL,
      bio = NULL, avatar_path = NULL, username = ?, username_normalized = ?, email = ?, email_normalized = ?
  WHERE id = ?
`)

export function deactivateAccount(accountId: string): void {
  const suffix = accountId.slice(0, 8)
  const deletedUsername = `deleted_${suffix}`
  const deletedEmail = `deleted_${suffix}@deleted.invalid`
  deactivateStmt.run(Date.now(), deletedUsername, deletedUsername, deletedEmail, deletedEmail, accountId)
}
