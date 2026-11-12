import crypto from 'node:crypto'
import { db } from './db.js'
import { notifyForEvent } from './notificationsRepo.js'
import { getAccountById, displayName } from './accountsRepo.js'

// Group prompts + sealed reveals (v2 Phase 12). See db.ts's prompt_groups
// comment for the data-model reuse rationale: a group prompt is exactly N
// ordinary `prompts` rows (the existing 1:1 shape) sharing one group_id,
// so each recipient's own completion tracking, media storage, and stamp
// award all come for free from the already-existing 1:1 completion path
// (server/promptRoutes.ts's POST /api/prompts/:id/complete) — nothing
// about it changes to support groups, it just also calls
// maybeRevealIfGroupComplete when the row it completed has a group_id.
//
// The one rule this whole file exists to enforce correctly (12.3): a
// sealed, unrevealed group's response content is visible to nobody but
// that response's own author — not other recipients, and not even the
// sender. groupDetail()'s `contentVisible` line is the single place that
// decides this for the group-prompt-specific views; completionsRepo.ts's
// canViewCompletion (and the feed filters built on it) apply the same
// rule to every other existing path a completion could otherwise leak
// through (feeds, calendars, comments/reactions).

export type DeadlineHours = 24 | 48 | 168
const DEADLINE_HOURS_MS: Record<DeadlineHours, number> = {
  24: 24 * 60 * 60 * 1000,
  48: 48 * 60 * 60 * 1000,
  168: 168 * 60 * 60 * 1000,
}

export function isDeadlineHours(v: unknown): v is DeadlineHours {
  return v === 24 || v === 48 || v === 168
}

export interface GroupPromptRow {
  id: string
  sender_account_id: string
  category: string
  prompt_text: string
  sealed: number
  deadline_at: number | null
  revealed_at: number | null
  cancelled_at: number | null
  created_at: number
}

export function getGroupById(id: string): GroupPromptRow | undefined {
  return db.prepare('SELECT * FROM prompt_groups WHERE id = ?').get(id) as GroupPromptRow | undefined
}

const insertGroup = db.prepare(`
  INSERT INTO prompt_groups (id, sender_account_id, category, prompt_text, sealed, deadline_at, created_at)
  VALUES (@id, @senderAccountId, @category, @text, @sealed, @deadlineAt, @createdAt)
`)
const insertMemberPrompt = db.prepare(`
  INSERT INTO prompts (id, sender_account_id, recipient_account_id, is_broadcast, category, prompt_text, status, group_id, created_at)
  VALUES (@id, @senderAccountId, @recipientAccountId, 0, @category, @text, 'pending', @groupId, @createdAt)
`)

// Deadline is always "N hours from send," a fixed millisecond duration —
// never a calendar-relative time of day — so time zones and daylight
// saving at the recipient's or sender's location never affect when it
// lands (12.5's "time zones and daylight saving at the deadline").
export function createGroupPrompt(params: {
  senderAccountId: string
  recipientAccountIds: string[]
  category: string
  text: string
  sealed: boolean
  deadlineHours: DeadlineHours
}): { groupId: string; promptIds: string[] } {
  const groupId = crypto.randomUUID()
  const now = Date.now()
  const deadlineAt = params.sealed ? now + DEADLINE_HOURS_MS[params.deadlineHours] : null
  const promptIds: string[] = []

  db.transaction(() => {
    insertGroup.run({
      id: groupId,
      senderAccountId: params.senderAccountId,
      category: params.category,
      text: params.text,
      sealed: params.sealed ? 1 : 0,
      deadlineAt,
      createdAt: now,
    })
    for (const recipientId of params.recipientAccountIds) {
      const id = crypto.randomUUID()
      promptIds.push(id)
      insertMemberPrompt.run({
        id,
        senderAccountId: params.senderAccountId,
        recipientAccountId: recipientId,
        category: params.category,
        text: params.text,
        groupId,
        createdAt: now,
      })
    }
  })()

  return { groupId, promptIds }
}

const groupProgressStmt = db.prepare(
  `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed FROM prompts WHERE group_id = ?`,
)
export function groupProgress(groupId: string): { total: number; completed: number } {
  const row = groupProgressStmt.get(groupId) as { total: number; completed: number | null }
  return { total: row.total, completed: row.completed ?? 0 }
}

const setRevealedStmt = db.prepare(`UPDATE prompt_groups SET revealed_at = ? WHERE id = ? AND revealed_at IS NULL`)
const groupMembersIdStmt = db.prepare(`SELECT recipient_account_id AS recipientAccountId FROM prompts WHERE group_id = ?`)

// Idempotent and safe to call twice for the same group (12.4): the
// sealed-reveal sweep job and the "everyone just finished" check in
// maybeRevealIfGroupComplete below can both race to reveal the same
// group. The UPDATE's own WHERE revealed_at IS NULL is the real guard —
// only the first caller gets changes === 1 and actually sends
// notifications; every later caller (this request retried, the sweep
// picking up a group that just completed itself a second before the tick)
// gets 0 changes and does nothing further.
export function revealGroup(groupId: string): boolean {
  const group = getGroupById(groupId)
  if (!group) return false
  const result = setRevealedStmt.run(Date.now(), groupId)
  if (result.changes === 0) return false

  const sender = getAccountById(group.sender_account_id)
  const senderName = sender ? displayName(sender) : 'Someone'
  const url = `/groups/${groupId}`
  // Accurate either way it opened: every recipient finishing and the
  // deadline passing both land here, and "everyone answered" would be
  // false for the latter (e.g. the sweep revealing a group nobody got to
  // in time).
  notifyForEvent(group.sender_account_id, 'sealed_reveal', 'Your sealed prompt is open', `It's open: "${group.prompt_text}"`, url)
  const members = groupMembersIdStmt.all(groupId) as { recipientAccountId: string }[]
  for (const { recipientAccountId } of members) {
    if (recipientAccountId === group.sender_account_id) continue // sent to self is already covered above
    notifyForEvent(recipientAccountId, 'sealed_reveal', 'Your sealed prompt is open', `${senderName}'s prompt is open: "${group.prompt_text}"`, url)
  }
  return true
}

// The common-case reveal path: "opens when every recipient has completed
// it, or when the deadline passes, whichever comes first." This covers
// the first half; groupPromptsJobs.ts's sweep covers the deadline half.
export function maybeRevealIfGroupComplete(groupId: string): void {
  const group = getGroupById(groupId)
  if (!group || !group.sealed || group.revealed_at || group.cancelled_at) return
  const { total, completed } = groupProgress(groupId)
  if (total > 0 && completed === total) revealGroup(groupId)
}

// 12.5: "the sender cancels the prompt (sealed content stays private to
// each author)." Cancelling never touches any member's prompts.status —
// it only sets cancelled_at, and every query that lists "pending" work
// for a recipient also checks the group's cancelled_at IS NULL, so a
// cancelled member row just stops being actionable. A group that has
// already revealed can't be cancelled (nothing left to take back), and
// whatever any individual author had already completed before
// cancellation stays visible only to that author forever — groupDetail's
// `contentVisible` check already guarantees this with no extra code,
// since a cancelled-and-never-revealed group has revealed_at permanently
// null.
export function cancelGroupPrompt(groupId: string, requesterId: string): { ok: true } | { ok: false; reason: string } {
  const group = getGroupById(groupId)
  if (!group) return { ok: false, reason: 'No group prompt with that id.' }
  if (group.sender_account_id !== requesterId) return { ok: false, reason: 'Only the sender can cancel this.' }
  if (group.revealed_at) return { ok: false, reason: 'This prompt has already opened.' }
  if (!group.cancelled_at) db.prepare('UPDATE prompt_groups SET cancelled_at = ? WHERE id = ?').run(Date.now(), groupId)
  return { ok: true }
}

export interface GroupSealState {
  sealed: boolean
  revealedAt: number | null
}

const sealStateStmt = db.prepare('SELECT sealed, revealed_at AS revealedAt FROM prompt_groups WHERE id = ?')

// The single fact completionsRepo.ts's canViewCompletion (and every feed
// built on it) needs to decide whether a group-member row's content is
// still sealed from a given viewer.
export function groupSealState(groupId: string): GroupSealState | undefined {
  const row = sealStateStmt.get(groupId) as { sealed: number; revealedAt: number | null } | undefined
  if (!row) return undefined
  return { sealed: Boolean(row.sealed), revealedAt: row.revealedAt }
}

interface MemberRow {
  id: string
  accountId: string
  username: string
  firstName: string | null
  orgName: string | null
  status: string
  completedAt: number | null
  mediaType: string | null
  mediaDataUrl: string | null
  autoCaption: string | null
  userCaption: string | null
}

const membersWithResponsesStmt = db.prepare(`
  SELECT p.id, p.recipient_account_id AS accountId, a.username, a.first_name AS firstName, a.organization_name AS orgName,
         p.status, p.completed_at AS completedAt, p.completion_media_type AS mediaType, p.completion_media_data_url AS mediaDataUrl,
         p.completion_auto_caption AS autoCaption, p.completion_user_caption AS userCaption
  FROM prompts p
  JOIN accounts a ON a.id = p.recipient_account_id
  WHERE p.group_id = ?
  ORDER BY a.username ASC
`)

export interface GroupDetailResponse {
  username: string
  displayName: string
  status: string
  isMine: boolean
  late: boolean
  mediaType?: string
  mediaDataUrl?: string
  autoCaption?: string
  userCaption?: string
}

export interface GroupDetailView {
  id: string
  category: string
  text: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  isSender: boolean
  senderUsername: string
  total: number
  completed: number
  responses: GroupDetailResponse[]
}

// The one function this whole file is really about. `contentVisible` is
// the entire sealed-content gate for this view: it is true for your own
// response always (you're its author), for everyone's once the group is
// unsealed or has revealed, and never otherwise — which means the
// sender, mid-seal, gets every response's status/late flag (fine, that's
// just "did they answer," not their content) but never a single field of
// anyone else's actual text or media.
export function groupDetail(groupId: string, viewerId: string): GroupDetailView | undefined {
  const group = getGroupById(groupId)
  if (!group) return undefined
  const members = membersWithResponsesStmt.all(groupId) as MemberRow[]
  const isSender = group.sender_account_id === viewerId
  const isRecipient = members.some((m) => m.accountId === viewerId)
  if (!isSender && !isRecipient) return undefined

  const sender = getAccountById(group.sender_account_id)
  const { total, completed } = groupProgress(groupId)
  const revealedAt = group.revealed_at

  return {
    id: group.id,
    category: group.category,
    text: group.prompt_text,
    sealed: Boolean(group.sealed),
    deadlineAt: group.deadline_at,
    revealedAt,
    cancelled: Boolean(group.cancelled_at),
    isSender,
    senderUsername: sender?.username ?? '',
    total,
    completed,
    responses: members.map((m) => {
      const isMine = m.accountId === viewerId
      const contentVisible = isMine || !group.sealed || Boolean(revealedAt)
      const late = Boolean(revealedAt) && m.status === 'completed' && m.completedAt !== null && m.completedAt > revealedAt!
      const base: GroupDetailResponse = {
        username: m.username,
        displayName: m.firstName ?? m.orgName ?? m.username,
        status: m.status,
        isMine,
        late,
      }
      if (contentVisible && m.status === 'completed') {
        base.mediaType = m.mediaType ?? undefined
        base.mediaDataUrl = m.mediaDataUrl ?? undefined
        base.autoCaption = m.autoCaption ?? undefined
        base.userCaption = m.userCaption ?? undefined
      }
      return base
    }),
  }
}

// --- Sent / received lists ----------------------------------------------

export interface SentGroupView {
  id: string
  category: string
  text: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  createdAt: number
  total: number
  completed: number
}

const sentGroupsStmt = db.prepare(`SELECT * FROM prompt_groups WHERE sender_account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)

// The sender's own list deliberately carries only the aggregate
// total/completed count, never which specific recipients have answered —
// "the sender sees only a progress count... until it opens" applies here
// too, not just to the detail view.
export function sentGroupPrompts(senderId: string, limit = 50, offset = 0): SentGroupView[] {
  const groups = sentGroupsStmt.all(senderId, limit, offset) as GroupPromptRow[]
  return groups.map((g) => {
    const { total, completed } = groupProgress(g.id)
    return {
      id: g.id,
      category: g.category,
      text: g.prompt_text,
      sealed: Boolean(g.sealed),
      deadlineAt: g.deadline_at,
      revealedAt: g.revealed_at,
      cancelled: Boolean(g.cancelled_at),
      createdAt: g.created_at,
      total,
      completed,
    }
  })
}

export interface ReceivedGroupView {
  groupId: string
  promptId: string
  category: string
  text: string
  senderUsername: string
  senderDisplayName: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  createdAt: number
  total: number
  completed: number
  myStatus: string
  late: boolean
}

const receivedGroupPromptsStmt = db.prepare(`
  SELECT p.id AS promptId, p.status, p.completed_at AS completedAt, p.category, p.prompt_text AS text,
         g.id AS groupId, g.sealed, g.deadline_at AS deadlineAt, g.revealed_at AS revealedAt, g.cancelled_at AS cancelledAt, g.created_at AS createdAt,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName
  FROM prompts p
  JOIN prompt_groups g ON g.id = p.group_id
  JOIN accounts sender ON sender.id = p.sender_account_id
  WHERE p.recipient_account_id = ?
  ORDER BY g.created_at DESC
`)

export function receivedGroupPrompts(recipientId: string): ReceivedGroupView[] {
  const rows = receivedGroupPromptsStmt.all(recipientId) as {
    promptId: string
    status: string
    completedAt: number | null
    category: string
    text: string
    groupId: string
    sealed: number
    deadlineAt: number | null
    revealedAt: number | null
    cancelledAt: number | null
    createdAt: number
    senderUsername: string
    senderFirstName: string | null
    senderOrgName: string | null
  }[]
  return rows.map((r) => {
    const { total, completed } = groupProgress(r.groupId)
    const late = Boolean(r.revealedAt) && r.status === 'completed' && r.completedAt !== null && r.completedAt > r.revealedAt!
    return {
      groupId: r.groupId,
      promptId: r.promptId,
      category: r.category,
      text: r.text,
      senderUsername: r.senderUsername,
      senderDisplayName: r.senderFirstName ?? r.senderOrgName ?? r.senderUsername,
      sealed: Boolean(r.sealed),
      deadlineAt: r.deadlineAt,
      revealedAt: r.revealedAt,
      cancelled: Boolean(r.cancelledAt),
      createdAt: r.createdAt,
      total,
      completed,
      myStatus: r.status,
      late,
    }
  })
}
