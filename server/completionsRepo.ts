import { db } from './db.js'
import { reactionCounts } from './reactionsRepo.js'
import { calendarsForCompletion } from './calendarsRepo.js'
import { blockedEitherWayIds } from './blocksRepo.js'
import { getBoardById, isSubscribed } from './boardsRepo.js'
import { hasOptedIntoAdultContent } from './accountsRepo.js'
import { groupSealState } from './groupPromptsRepo.js'

export interface CompletionView {
  id: string
  kind: '1:1' | 'broadcast'
  category: string
  text: string
  autoCaption?: string
  userCaption?: string
  mediaType?: string
  mediaDataUrl?: string
  noteColor?: string
  noteSticker?: string
  noteHandwriting?: string
  createdAt: number
  dayKey: string
  senderUsername?: string
  senderDisplayName?: string
  completerUsername: string
  completerDisplayName: string
  boardId?: string
  boardName?: string
  isSelfSent: boolean
  likes: number
  dislikes: number
  laughs: number
  pins: number
  myReaction: 'like' | 'dislike' | 'laugh' | null
  pinnedByMe: boolean
  calendarIds: string[]
  calendarNames: string[]
  // Phase 12 — set only for a completion that came from a group prompt.
  // late is only ever true once the group has revealed (a completion made
  // after the seal broke, shown normally but marked).
  groupId?: string
  late?: boolean
}

interface OneToOneRow {
  id: string
  category: string
  text: string
  autoCaption: string | null
  userCaption: string | null
  mediaType: string | null
  mediaDataUrl: string | null
  noteColor: string | null
  noteSticker: string | null
  noteHandwriting: string | null
  createdAt: number
  recipientAccountId: string | null
  groupId: string | null
  senderUsername: string
  senderFirstName: string | null
  senderOrgName: string | null
  completerUsername: string
  completerFirstName: string | null
  completerOrgName: string | null
}

// The single sealed-content gate every 1:1-shaped feed in this file
// applies before a row is allowed to reach a viewer (12.3). A row with no
// group_id (an ordinary 1:1 prompt, the overwhelming majority) is never
// hidden by this — it only ever does something for a group-member row.
function rowIsSealedHidden(groupId: string | null, recipientAccountId: string | null, viewerId: string | undefined): boolean {
  if (!groupId) return false
  const seal = groupSealState(groupId)
  if (!seal || !seal.sealed || seal.revealedAt) return false
  return viewerId !== recipientAccountId
}

interface BroadcastRow extends OneToOneRow {
  boardId: string | null
  boardName: string | null
  senderAccountId?: string
  completerAccountId?: string
}

const oneToOneByRecipient = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption,
         p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting, p.completed_at AS createdAt,
         p.recipient_account_id AS recipientAccountId, p.group_id AS groupId,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
  FROM prompts p
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts completer ON completer.id = p.recipient_account_id
  WHERE p.is_broadcast = 0 AND p.status = 'completed' AND p.recipient_account_id = ?
  ORDER BY p.completed_at DESC
`)

const oneToOneByFollowedRecipients = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption,
         p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting, p.completed_at AS createdAt,
         p.recipient_account_id AS recipientAccountId, p.group_id AS groupId,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
  FROM prompts p
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts completer ON completer.id = p.recipient_account_id
  JOIN follows f ON f.followee_account_id = p.recipient_account_id AND f.follower_account_id = ?
  WHERE p.is_broadcast = 0 AND p.status = 'completed'
  ORDER BY p.completed_at DESC
`)

const broadcastByCompleter = db.prepare(`
  SELECT c.id, p.category, p.prompt_text AS text, c.auto_caption AS autoCaption, c.user_caption AS userCaption,
         c.media_type AS mediaType, c.media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
         c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts completer ON completer.id = c.completer_account_id
  LEFT JOIN boards b ON b.id = p.board_id
  WHERE c.completer_account_id = ?
  ORDER BY c.created_at DESC
`)

const broadcastByBoardIds = db.prepare(`
  SELECT c.id, p.category, p.prompt_text AS text, c.auto_caption AS autoCaption, c.user_caption AS userCaption,
         c.media_type AS mediaType, c.media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
         c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName,
         p.sender_account_id AS senderAccountId, c.completer_account_id AS completerAccountId
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts completer ON completer.id = c.completer_account_id
  LEFT JOIN boards b ON b.id = p.board_id
  JOIN board_subscribers s ON s.board_id = p.board_id AND s.account_id = ?
  ORDER BY c.created_at DESC
`)

function dayKeyFor(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

function normalizeOneToOne(row: OneToOneRow, viewerId?: string): CompletionView {
  const tags = calendarsForCompletion(row.id)
  return {
    id: row.id,
    kind: '1:1',
    category: row.category,
    text: row.text,
    autoCaption: row.autoCaption ?? undefined,
    userCaption: row.userCaption ?? undefined,
    mediaType: row.mediaType ?? undefined,
    mediaDataUrl: row.mediaDataUrl ?? undefined,
    noteColor: row.noteColor ?? undefined,
    noteSticker: row.noteSticker ?? undefined,
    noteHandwriting: row.noteHandwriting ?? undefined,
    createdAt: row.createdAt,
    dayKey: dayKeyFor(row.createdAt),
    senderUsername: row.senderUsername,
    senderDisplayName: row.senderFirstName ?? row.senderOrgName ?? row.senderUsername,
    completerUsername: row.completerUsername,
    completerDisplayName: row.completerFirstName ?? row.completerOrgName ?? row.completerUsername,
    isSelfSent: false,
    ...reactionCounts(row.id, viewerId),
    calendarIds: tags.map((t) => t.id),
    calendarNames: tags.map((t) => t.name),
    groupId: row.groupId ?? undefined,
    late: row.groupId ? isLateCompletion(row.groupId, row.createdAt) : undefined,
  }
}

// A group-prompt completion is "late" once it was made after that group's
// seal actually broke — never true for a non-group prompt, and never true
// before a group has revealed at all (an on-time completion before reveal
// isn't late just because reveal hasn't happened yet).
function isLateCompletion(groupId: string, completedAt: number): boolean {
  const seal = groupSealState(groupId)
  return Boolean(seal?.revealedAt && completedAt > seal.revealedAt)
}

function normalizeBroadcast(row: BroadcastRow, viewerId?: string): CompletionView {
  const tags = calendarsForCompletion(row.id)
  const senderDisplayName = row.senderFirstName ?? row.senderOrgName ?? row.senderUsername
  const completerDisplayName = row.completerFirstName ?? row.completerOrgName ?? row.completerUsername
  return {
    id: row.id,
    kind: 'broadcast',
    category: row.category,
    text: row.text,
    autoCaption: row.autoCaption ?? undefined,
    userCaption: row.userCaption ?? undefined,
    mediaType: row.mediaType ?? undefined,
    mediaDataUrl: row.mediaDataUrl ?? undefined,
    noteColor: row.noteColor ?? undefined,
    noteSticker: row.noteSticker ?? undefined,
    noteHandwriting: row.noteHandwriting ?? undefined,
    createdAt: row.createdAt,
    dayKey: dayKeyFor(row.createdAt),
    senderUsername: row.senderUsername,
    senderDisplayName,
    completerUsername: row.completerUsername,
    completerDisplayName,
    boardId: row.boardId ?? undefined,
    boardName: row.boardName ?? undefined,
    isSelfSent: row.senderUsername === row.completerUsername,
    ...reactionCounts(row.id, viewerId),
    calendarIds: tags.map((t) => t.id),
    calendarNames: tags.map((t) => t.name),
  }
}

function paginate<T>(items: T[], limit: number, offset: number): T[] {
  return items.slice(offset, offset + limit)
}

// Every one of my own resolved completions — 1:1 sent to me plus any
// broadcast (organization or board) I've completed. This is "All Activity":
// my own calendar, private to me by default regardless of source. Not
// filtered by blocks — it's your own history and stays yours regardless of
// who you've since blocked. Defaults to a generous cap rather than a small
// page size since it backs a calendar view that expects a full month at a
// time, not a "load more" feed.
export function myActivity(accountId: string, limit = 500, offset = 0): CompletionView[] {
  // rowIsSealedHidden never actually hides anything here (every row this
  // query returns already has accountId as its own recipient, so the
  // "except the response's own author" exception always applies) — kept
  // for defense in depth rather than reasoning out a special case.
  const oneToOne = (oneToOneByRecipient.all(accountId) as OneToOneRow[])
    .filter((r) => !rowIsSealedHidden(r.groupId, r.recipientAccountId, accountId))
    .map((r) => normalizeOneToOne(r, accountId))
  const broadcasts = (broadcastByCompleter.all(accountId) as BroadcastRow[]).map((r) => normalizeBroadcast(r, accountId))
  return paginate([...oneToOne, ...broadcasts].sort((a, b) => b.createdAt - a.createdAt), limit, offset)
}

// 1:1 completions by accounts I follow — "Following" tab. No separate
// block filtering needed: blocking someone always severs any follow
// between the two of you (blocksRepo.ts), so a blocked account's
// completions can't reach here via the follows join this already depends on.
export function followingFeed(accountId: string, limit = 50, offset = 0): CompletionView[] {
  // The real exposure this guards: a sealed group prompt's other
  // recipient might be someone you follow, so their completion would
  // otherwise surface here — before reveal, exactly like any stranger,
  // you are not that response's author.
  const rows = (oneToOneByFollowedRecipients.all(accountId) as OneToOneRow[])
    .filter((r) => !rowIsSealedHidden(r.groupId, r.recipientAccountId, accountId))
    .map((r) => normalizeOneToOne(r, accountId))
  return paginate(rows, limit, offset)
}

// Board-broadcast completions from boards I subscribe to — "Community" tab.
// Unlike Following, a block doesn't touch board subscriptions, so a
// completion from a blocked fellow-subscriber (or the board's own blocked
// owner) needs an explicit filter here.
export function communityFeed(accountId: string, limit = 50, offset = 0): CompletionView[] {
  const blocked = blockedEitherWayIds(accountId)
  // Defensive, on top of the subscribe-time gate (boardsRoutes.ts) that
  // should already keep a non-opted-in viewer out of an adult board's
  // subscriber list in the first place — a later toggle-off of the
  // account-level opt-in still can't leak content already subscribed to.
  const adultOk = hasOptedIntoAdultContent(accountId)
  const rows = (broadcastByBoardIds.all(accountId) as BroadcastRow[]).filter((r) => {
    if (!r.boardId) return false
    if (blocked.size > 0 && (blocked.has(r.senderAccountId!) || blocked.has(r.completerAccountId!))) return false
    if (!adultOk && getBoardById(r.boardId)?.is_adult) return false
    return true
  })
  return paginate(rows.map((r) => normalizeBroadcast(r, accountId)), limit, offset)
}

// What shows on someone else's public profile: every broadcast (org or
// board) and 1:1 prompt they've completed — the account-level
// profile_visibility switch (server/accountsRepo.ts's
// canViewProfileActivity) is what actually gates whether a given viewer
// gets to call this at all, checked by the route before this runs, so
// nothing here is held back per-completion. If the viewer has blocked (or
// is blocked by) the profile's owner, none of it shows regardless — there's
// nothing to negotiate part-way when the two of you can't interact at all.
export function publicActivity(targetAccountId: string, viewerId?: string, limit = 100, offset = 0): CompletionView[] {
  if (viewerId && blockedEitherWayIds(viewerId).has(targetAccountId)) return []
  const broadcasts = (broadcastByCompleter.all(targetAccountId) as BroadcastRow[]).map((r) => normalizeBroadcast(r, viewerId))
  // The other real exposure: viewing a sealed group prompt's recipient's
  // own public profile before reveal, as any other viewer (including the
  // group's own sender, who is never this row's recipientAccountId).
  const oneToOne = (oneToOneByRecipient.all(targetAccountId) as OneToOneRow[])
    .filter((r) => !rowIsSealedHidden(r.groupId, r.recipientAccountId, viewerId))
    .map((r) => normalizeOneToOne(r, viewerId))
  return paginate([...broadcasts, ...oneToOne].sort((a, b) => b.createdAt - a.createdAt), limit, offset)
}

// Everything (from any member) tagged into a specific calendar. Backs a
// calendar's own month-grid view, so this defaults to a generous cap
// rather than a small page size, same reasoning as myActivity above.
export function calendarFeed(calendarId: string, viewerId?: string, limit = 500, offset = 0): CompletionView[] {
  const oneToOne = (
    db
      .prepare(
        `
    SELECT p.id, p.category, p.prompt_text AS text, p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption,
           p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting, p.completed_at AS createdAt,
         p.recipient_account_id AS recipientAccountId, p.group_id AS groupId,
           sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
           completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
    FROM prompts p
    JOIN accounts sender ON sender.id = p.sender_account_id
    JOIN accounts completer ON completer.id = p.recipient_account_id
    JOIN completion_calendars cc ON cc.completion_id = p.id
    WHERE cc.calendar_id = ? AND p.is_broadcast = 0 AND p.status = 'completed'
  `,
      )
      .all(calendarId) as OneToOneRow[]
  )
    .filter((r) => !rowIsSealedHidden(r.groupId, r.recipientAccountId, viewerId))
    .map((r) => normalizeOneToOne(r, viewerId))

  const broadcasts = (
    db
      .prepare(
        `
    SELECT c.id, p.category, p.prompt_text AS text, c.auto_caption AS autoCaption, c.user_caption AS userCaption,
           c.media_type AS mediaType, c.media_data_url AS mediaDataUrl,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
         c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
           sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
           completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
    FROM prompt_completions c
    JOIN prompts p ON p.id = c.prompt_id
    JOIN accounts sender ON sender.id = p.sender_account_id
    JOIN accounts completer ON completer.id = c.completer_account_id
    LEFT JOIN boards b ON b.id = p.board_id
    JOIN completion_calendars cc ON cc.completion_id = c.id
    WHERE cc.calendar_id = ?
  `,
      )
      .all(calendarId) as BroadcastRow[]
  ).map((r) => normalizeBroadcast(r, viewerId))

  return paginate([...oneToOne, ...broadcasts].sort((a, b) => b.createdAt - a.createdAt), limit, offset)
}

// A completion the caller owns, resolved to its kind + the account that
// completed it — used to authorize calendar-tagging (only your own
// completion, and only into calendars you belong to).
export function ownedCompletion(completionId: string, accountId: string): { kind: '1:1' | 'broadcast' } | undefined {
  const oneToOne = db.prepare('SELECT 1 FROM prompts WHERE id = ? AND recipient_account_id = ? AND is_broadcast = 0').get(completionId, accountId)
  if (oneToOne) return { kind: '1:1' }
  const broadcast = db.prepare('SELECT 1 FROM prompt_completions WHERE id = ? AND completer_account_id = ?').get(completionId, accountId)
  if (broadcast) return { kind: 'broadcast' }
  return undefined
}

const oneToOneAccessStmt = db.prepare('SELECT sender_account_id, recipient_account_id, group_id FROM prompts WHERE id = ? AND is_broadcast = 0')
const broadcastAccessStmt = db.prepare(`
  SELECT p.sender_account_id AS senderAccountId, c.completer_account_id AS completerAccountId, p.board_id AS boardId
  FROM prompt_completions c JOIN prompts p ON p.id = c.prompt_id
  WHERE c.id = ?
`)

// Reactions and comments both hang off a completion id with no visibility
// check of their own — this is what "respect existing visibility rules"
// (comments/reactions on someone else's content, Phase 3.1) resolves to in
// terms of the actual schema: a 1:1 completion is private to the two
// people it was between, a board-backed completion follows that board's
// own public/invite visibility, and a plain org-to-followers broadcast
// (no board) has always been openly readable (see the unauthenticated
// GET /api/organizations/:username/broadcasts), so it stays that way here.
export function canViewCompletion(completionId: string, viewerId?: string): boolean {
  const oneToOne = oneToOneAccessStmt.get(completionId) as
    | { sender_account_id: string; recipient_account_id: string | null; group_id: string | null }
    | undefined
  if (oneToOne) {
    // Phase 12: a sealed, unrevealed group prompt's response is visible to
    // nobody but its own author — not the sender either, which is why
    // this branch returns before the normal sender-or-recipient check
    // below ever runs for a hidden row. This is also what disables
    // comments and reactions on a sealed item (12.3): both hang off this
    // same function with no visibility logic of their own.
    if (rowIsSealedHidden(oneToOne.group_id, oneToOne.recipient_account_id, viewerId)) return false
    return viewerId === oneToOne.sender_account_id || viewerId === oneToOne.recipient_account_id
  }

  const broadcast = broadcastAccessStmt.get(completionId) as
    | { senderAccountId: string; completerAccountId: string; boardId: string | null }
    | undefined
  if (!broadcast) return false
  if (!broadcast.boardId) return true

  const board = getBoardById(broadcast.boardId)
  if (!board) return true
  const isOwner = viewerId === board.owner_account_id
  if (board.is_adult && !isOwner && (!viewerId || !hasOptedIntoAdultContent(viewerId))) return false
  if (board.visibility === 'public') return true
  return Boolean(viewerId) && (isOwner || isSubscribed(broadcast.boardId, viewerId!))
}
