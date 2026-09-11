import { db } from './db.js'
import { reactionCounts } from './reactionsRepo.js'
import { calendarsForCompletion, isCompletionPublic } from './calendarsRepo.js'

export interface CompletionView {
  id: string
  kind: '1:1' | 'broadcast'
  category: string
  text: string
  autoCaption?: string
  userCaption?: string
  mediaType?: string
  mediaDataUrl?: string
  createdAt: number
  dayKey: string
  senderUsername?: string
  senderDisplayName?: string
  completerUsername: string
  completerDisplayName: string
  boardId?: string
  boardName?: string
  isSelfSent: boolean
  upvotes: number
  pins: number
  upvotedByMe: boolean
  pinnedByMe: boolean
  calendarIds: string[]
  calendarNames: string[]
}

interface OneToOneRow {
  id: string
  category: string
  text: string
  autoCaption: string | null
  userCaption: string | null
  mediaType: string | null
  mediaDataUrl: string | null
  createdAt: number
  senderUsername: string
  senderFirstName: string | null
  senderOrgName: string | null
  completerUsername: string
  completerFirstName: string | null
  completerOrgName: string | null
}

interface BroadcastRow extends OneToOneRow {
  boardId: string | null
  boardName: string | null
}

const oneToOneByRecipient = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption,
         p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl, p.completed_at AS createdAt,
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
         p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl, p.completed_at AS createdAt,
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
         c.media_type AS mediaType, c.media_data_url AS mediaDataUrl, c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
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
         c.media_type AS mediaType, c.media_data_url AS mediaDataUrl, c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         completer.username AS completerUsername, completer.first_name AS completerFirstName, completer.organization_name AS completerOrgName
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
  }
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

// Every one of my own resolved completions — 1:1 sent to me plus any
// broadcast (organization or board) I've completed. This is "All Activity":
// my own calendar, private to me by default regardless of source.
export function myActivity(accountId: string): CompletionView[] {
  const oneToOne = (oneToOneByRecipient.all(accountId) as OneToOneRow[]).map((r) => normalizeOneToOne(r, accountId))
  const broadcasts = (broadcastByCompleter.all(accountId) as BroadcastRow[]).map((r) => normalizeBroadcast(r, accountId))
  return [...oneToOne, ...broadcasts].sort((a, b) => b.createdAt - a.createdAt)
}

// 1:1 completions by accounts I follow — "Following" tab.
export function followingFeed(accountId: string): CompletionView[] {
  return (oneToOneByFollowedRecipients.all(accountId) as OneToOneRow[]).map((r) => normalizeOneToOne(r, accountId))
}

// Board-broadcast completions from boards I subscribe to — "Community" tab.
export function communityFeed(accountId: string): CompletionView[] {
  return (broadcastByBoardIds.all(accountId) as BroadcastRow[])
    .filter((r) => r.boardId)
    .map((r) => normalizeBroadcast(r, accountId))
}

// What shows on someone else's public profile: any broadcast (org or board)
// they've completed is inherently public (they opted into a public
// challenge), plus any 1:1 completion they've tagged into a public
// calendar — a private calendar can organize it for them, but it can't
// make it private once a board already made it public.
export function publicActivity(targetAccountId: string, viewerId?: string): CompletionView[] {
  const broadcasts = (broadcastByCompleter.all(targetAccountId) as BroadcastRow[]).map((r) => normalizeBroadcast(r, viewerId))
  const oneToOne = (oneToOneByRecipient.all(targetAccountId) as OneToOneRow[])
    .filter((r) => isCompletionPublic(r.id))
    .map((r) => normalizeOneToOne(r, viewerId))
  return [...broadcasts, ...oneToOne].sort((a, b) => b.createdAt - a.createdAt)
}

// Everything (from any member) tagged into a specific calendar.
export function calendarFeed(calendarId: string, viewerId?: string): CompletionView[] {
  const oneToOne = (
    db
      .prepare(
        `
    SELECT p.id, p.category, p.prompt_text AS text, p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption,
           p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl, p.completed_at AS createdAt,
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
  ).map((r) => normalizeOneToOne(r, viewerId))

  const broadcasts = (
    db
      .prepare(
        `
    SELECT c.id, p.category, p.prompt_text AS text, c.auto_caption AS autoCaption, c.user_caption AS userCaption,
           c.media_type AS mediaType, c.media_data_url AS mediaDataUrl, c.created_at AS createdAt, p.board_id AS boardId, b.name AS boardName,
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

  return [...oneToOne, ...broadcasts].sort((a, b) => b.createdAt - a.createdAt)
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
