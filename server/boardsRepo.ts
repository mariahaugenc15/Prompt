import { db } from './db.js'
import { getAccountById, displayName, hasOptedIntoAdultContent, hasOptedOutOfTopFans } from './accountsRepo.js'
import { blockedEitherWayIds } from './blocksRepo.js'

export interface BoardRow {
  id: string
  owner_account_id: string
  name: string
  description: string
  category: string
  visibility: 'public' | 'invite'
  location_tag: string | null
  icon: string | null
  is_adult: number
  top_fans_public: number
  created_at: number
}

const insertBoard = db.prepare(`
  INSERT INTO boards (id, owner_account_id, name, description, category, visibility, location_tag, icon, is_adult, created_at)
  VALUES (@id, @ownerAccountId, @name, @description, @category, @visibility, @locationTag, @icon, @isAdult, @createdAt)
`)
const insertSubscriber = db.prepare(
  'INSERT OR IGNORE INTO board_subscribers (board_id, account_id, created_at) VALUES (?, ?, ?)',
)
const byId = db.prepare('SELECT * FROM boards WHERE id = ?')
const subscriberCountStmt = db.prepare('SELECT COUNT(*) AS n FROM board_subscribers WHERE board_id = ?')
const isSubscribedStmt = db.prepare('SELECT 1 FROM board_subscribers WHERE board_id = ? AND account_id = ?')
const subscriberIdsStmt = db.prepare('SELECT account_id FROM board_subscribers WHERE board_id = ?')

// Boards that are public and not already subscribed to — the "Discover"
// list backing anyone finding a board they don't already belong to.
// Adult-flagged boards are excluded from this (and search, below) unless
// the viewer has opted in — filtered in SQL, unlike the blocked-owner
// check which needs a dynamic id set computed in JS first.
const discoverStmt = db.prepare(`
  SELECT b.* FROM boards b
  WHERE b.visibility = 'public'
    AND (b.is_adult = 0 OR ? = 1)
    AND NOT EXISTS (SELECT 1 FROM board_subscribers s WHERE s.board_id = b.id AND s.account_id = ?)
  ORDER BY b.created_at DESC
  LIMIT ? OFFSET ?
`)

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}

const searchStmt = db.prepare(`
  SELECT * FROM boards
  WHERE visibility = 'public' AND (is_adult = 0 OR ? = 1)
    AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`)

// Boards you own or have joined — "Your boards".
const mineStmt = db.prepare(`
  SELECT b.* FROM boards b
  JOIN board_subscribers s ON s.board_id = b.id
  WHERE s.account_id = ?
  ORDER BY b.created_at DESC
`)

// Discover/search results are fetched a little deep past the requested
// page before filtering, so a blocked owner's boards being skipped doesn't
// shrink the page below what was asked for. (Adult-content filtering
// happens in SQL above instead, since it doesn't need a dynamic id set.)
function filterBlockedOwners(boards: BoardRow[], viewerId: string | undefined, limit: number): BoardRow[] {
  if (!viewerId) return boards.slice(0, limit)
  const blocked = blockedEitherWayIds(viewerId)
  if (blocked.size === 0) return boards.slice(0, limit)
  return boards.filter((b) => !blocked.has(b.owner_account_id)).slice(0, limit)
}

export function createBoard(input: {
  id: string
  ownerAccountId: string
  name: string
  description: string
  category: string
  visibility: 'public' | 'invite'
  locationTag?: string
  icon?: string
  isAdult?: boolean
  createdAt: number
}): void {
  insertBoard.run({
    ...input,
    locationTag: input.locationTag ?? null,
    icon: input.icon ?? null,
    isAdult: input.isAdult ? 1 : 0,
  })
  insertSubscriber.run(input.id, input.ownerAccountId, input.createdAt)
}

export function getSubscriberIds(boardId: string): string[] {
  return (subscriberIdsStmt.all(boardId) as { account_id: string }[]).map((r) => r.account_id)
}

export function getBoardById(id: string): BoardRow | undefined {
  return byId.get(id) as BoardRow | undefined
}

export function subscriberCount(boardId: string): number {
  return (subscriberCountStmt.get(boardId) as { n: number }).n
}

export function isSubscribed(boardId: string, accountId: string): boolean {
  return Boolean(isSubscribedStmt.get(boardId, accountId))
}

export function subscribe(boardId: string, accountId: string): void {
  insertSubscriber.run(boardId, accountId, Date.now())
}

// Fetches a bit past the page (limit + blocked.size) so filtering blocked
// owners out afterward doesn't leave the page short.
export function listDiscoverable(viewerId: string | undefined, limit: number, offset = 0): BoardRow[] {
  const adultOk = viewerId && hasOptedIntoAdultContent(viewerId) ? 1 : 0
  const overfetch = limit + (viewerId ? blockedEitherWayIds(viewerId).size : 0)
  const rows = discoverStmt.all(adultOk, viewerId ?? '', overfetch, offset) as BoardRow[]
  return filterBlockedOwners(rows, viewerId, limit)
}

export function searchBoards(query: string, viewerId: string | undefined, limit: number, offset = 0): BoardRow[] {
  const like = `%${escapeLike(query.trim().toLowerCase())}%`
  const adultOk = viewerId && hasOptedIntoAdultContent(viewerId) ? 1 : 0
  const overfetch = limit + (viewerId ? blockedEitherWayIds(viewerId).size : 0)
  const rows = searchStmt.all(adultOk, like, like, overfetch, offset) as BoardRow[]
  return filterBlockedOwners(rows, viewerId, limit)
}

export function getBoardsForAccount(accountId: string): BoardRow[] {
  return mineStmt.all(accountId) as BoardRow[]
}

export function publicBoardView(board: BoardRow, viewerId?: string) {
  const owner = getAccountById(board.owner_account_id)
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    category: board.category,
    visibility: board.visibility,
    locationTag: board.location_tag ?? undefined,
    icon: board.icon ?? undefined,
    isAdult: Boolean(board.is_adult),
    topFansPublic: Boolean(board.top_fans_public),
    ownerUsername: owner?.username ?? '',
    ownerDisplayName: owner ? displayName(owner) : '',
    subscriberCount: subscriberCount(board.id),
    isSubscribed: viewerId ? isSubscribed(board.id, viewerId) : undefined,
    isOwner: viewerId ? viewerId === board.owner_account_id : undefined,
    createdAt: board.created_at,
  }
}

const setAdultFlagStmt = db.prepare('UPDATE boards SET is_adult = ? WHERE id = ?')

// Owner- or admin-only at the route level (boardsRoutes.ts/adminRoutes.ts)
// — this just performs the write once a caller is already authorized.
export function setBoardAdultFlag(boardId: string, isAdult: boolean): void {
  setAdultFlagStmt.run(isAdult ? 1 : 0, boardId)
}

const setTopFansPublicStmt = db.prepare('UPDATE boards SET top_fans_public = ? WHERE id = ?')

// Owner-only at the route level — this just performs the write.
export function setBoardTopFansPublic(boardId: string, isPublic: boolean): void {
  setTopFansPublicStmt.run(isPublic ? 1 : 0, boardId)
}

// For each account subscribed to any board this owner runs, counts board
// challenges broadcast to them since they joined that board (across all of
// the owner's boards, not just one) and how many they actually completed —
// "response rate" per the brief. A challenge only counts toward a
// subscriber once they'd already joined when it went out, matching "since
// they joined".
const topFansStmt = db.prepare(`
  SELECT s.account_id AS accountId,
         a.username AS username,
         a.first_name AS firstName,
         a.organization_name AS organizationName,
         COUNT(p.id) AS received,
         SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END) AS completed
  FROM board_subscribers s
  JOIN boards b ON b.id = s.board_id AND b.owner_account_id = ?
  JOIN accounts a ON a.id = s.account_id
  JOIN prompts p ON p.board_id = b.id AND p.is_broadcast = 1 AND p.created_at >= s.created_at
  LEFT JOIN prompt_completions c ON c.prompt_id = p.id AND c.completer_account_id = s.account_id
  WHERE s.account_id != ?
  GROUP BY s.account_id
`)

export interface TopFan {
  accountId: string
  username: string
  displayName: string
  received: number
  completed: number
  responseRate: number
}

interface TopFanRow {
  accountId: string
  username: string
  firstName: string | null
  organizationName: string | null
  received: number
  completed: number
}

// Configurable (TOP_FANS_MIN_RECEIVED) so a subscriber with one of one
// challenge received, completed, can't outrank someone with a long, mostly
// consistent history — they need at least this many challenges received
// across the owner's boards before they're ranked at all.
const MIN_RECEIVED_FOR_TOP_FANS = Number(process.env.TOP_FANS_MIN_RECEIVED ?? 3)

export function getTopFans(ownerAccountId: string): TopFan[] {
  return (topFansStmt.all(ownerAccountId, ownerAccountId) as TopFanRow[])
    .filter((r) => r.received >= MIN_RECEIVED_FOR_TOP_FANS && !hasOptedOutOfTopFans(r.accountId))
    .map((r) => ({
      accountId: r.accountId,
      username: r.username,
      displayName: r.firstName ?? r.organizationName ?? r.username,
      received: r.received,
      completed: r.completed,
      responseRate: r.completed / r.received,
    }))
    .sort((a, b) => b.responseRate - a.responseRate || b.completed - a.completed)
}
