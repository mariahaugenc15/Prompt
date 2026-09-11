import { db } from './db.js'
import { getAccountById, displayName } from './accountsRepo.js'
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
  created_at: number
}

const insertBoard = db.prepare(`
  INSERT INTO boards (id, owner_account_id, name, description, category, visibility, location_tag, icon, created_at)
  VALUES (@id, @ownerAccountId, @name, @description, @category, @visibility, @locationTag, @icon, @createdAt)
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
const discoverStmt = db.prepare(`
  SELECT b.* FROM boards b
  WHERE b.visibility = 'public'
    AND NOT EXISTS (SELECT 1 FROM board_subscribers s WHERE s.board_id = b.id AND s.account_id = ?)
  ORDER BY b.created_at DESC
  LIMIT ? OFFSET ?
`)

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}

const searchStmt = db.prepare(`
  SELECT * FROM boards
  WHERE visibility = 'public' AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')
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
// shrink the page below what was asked for.
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
  createdAt: number
}): void {
  insertBoard.run({ ...input, locationTag: input.locationTag ?? null, icon: input.icon ?? null })
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
  const overfetch = limit + (viewerId ? blockedEitherWayIds(viewerId).size : 0)
  const rows = discoverStmt.all(viewerId ?? '', overfetch, offset) as BoardRow[]
  return filterBlockedOwners(rows, viewerId, limit)
}

export function searchBoards(query: string, viewerId: string | undefined, limit: number, offset = 0): BoardRow[] {
  const like = `%${escapeLike(query.trim().toLowerCase())}%`
  const overfetch = limit + (viewerId ? blockedEitherWayIds(viewerId).size : 0)
  const rows = searchStmt.all(like, like, overfetch, offset) as BoardRow[]
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
    ownerUsername: owner?.username ?? '',
    ownerDisplayName: owner ? displayName(owner) : '',
    subscriberCount: subscriberCount(board.id),
    isSubscribed: viewerId ? isSubscribed(board.id, viewerId) : undefined,
    isOwner: viewerId ? viewerId === board.owner_account_id : undefined,
    createdAt: board.created_at,
  }
}
