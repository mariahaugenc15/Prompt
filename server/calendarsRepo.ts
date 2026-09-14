import { db } from './db.js'
import { blockedEitherWayIds } from './blocksRepo.js'

export interface CalendarRow {
  id: string
  owner_account_id: string
  name: string
  visibility: 'public' | 'private'
  created_at: number
}

const insertCalendar = db.prepare(
  'INSERT INTO calendars (id, owner_account_id, name, visibility, created_at) VALUES (@id, @ownerAccountId, @name, @visibility, @createdAt)',
)
const insertMember = db.prepare('INSERT OR IGNORE INTO calendar_members (calendar_id, account_id, created_at) VALUES (?, ?, ?)')
const deleteMember = db.prepare('DELETE FROM calendar_members WHERE calendar_id = ? AND account_id = ?')
const byId = db.prepare('SELECT * FROM calendars WHERE id = ?')
const isMemberStmt = db.prepare('SELECT 1 FROM calendar_members WHERE calendar_id = ? AND account_id = ?')
const memberCountStmt = db.prepare('SELECT COUNT(*) AS n FROM calendar_members WHERE calendar_id = ?')
const setVisibilityStmt = db.prepare('UPDATE calendars SET visibility = ? WHERE id = ? AND owner_account_id = ?')

const discoverStmt = db.prepare(`
  SELECT c.* FROM calendars c
  WHERE c.visibility = 'public'
    AND NOT EXISTS (SELECT 1 FROM calendar_members m WHERE m.calendar_id = c.id AND m.account_id = ?)
  ORDER BY c.created_at DESC
  LIMIT ? OFFSET ?
`)

const mineStmt = db.prepare(`
  SELECT c.* FROM calendars c
  JOIN calendar_members m ON m.calendar_id = c.id
  WHERE m.account_id = ?
  ORDER BY c.created_at DESC
`)

const memberIdsStmt = db.prepare('SELECT account_id FROM calendar_members WHERE calendar_id = ?')

export function createCalendar(input: { id: string; ownerAccountId: string; name: string; visibility: 'public' | 'private'; createdAt: number }): void {
  insertCalendar.run(input)
  insertMember.run(input.id, input.ownerAccountId, input.createdAt)
}

export function getCalendarById(id: string): CalendarRow | undefined {
  return byId.get(id) as CalendarRow | undefined
}

export function isMember(calendarId: string, accountId: string): boolean {
  return Boolean(isMemberStmt.get(calendarId, accountId))
}

export function memberCount(calendarId: string): number {
  return (memberCountStmt.get(calendarId) as { n: number }).n
}

export function memberIds(calendarId: string): string[] {
  return (memberIdsStmt.all(calendarId) as { account_id: string }[]).map((r) => r.account_id)
}

export function join(calendarId: string, accountId: string): void {
  insertMember.run(calendarId, accountId, Date.now())
}

export function leave(calendarId: string, accountId: string): void {
  deleteMember.run(calendarId, accountId)
}

export function setVisibility(calendarId: string, ownerAccountId: string, visibility: 'public' | 'private'): boolean {
  return setVisibilityStmt.run(visibility, calendarId, ownerAccountId).changes > 0
}

// Fetches a little past the page so filtering out calendars owned by a
// blocked-either-way account afterward doesn't leave the page short.
export function listDiscoverable(viewerId: string, limit: number, offset = 0): CalendarRow[] {
  const blocked = blockedEitherWayIds(viewerId)
  const overfetch = limit + blocked.size
  const rows = discoverStmt.all(viewerId, overfetch, offset) as CalendarRow[]
  return (blocked.size === 0 ? rows : rows.filter((c) => !blocked.has(c.owner_account_id))).slice(0, limit)
}

export function listMine(accountId: string): CalendarRow[] {
  return mineStmt.all(accountId) as CalendarRow[]
}

export function publicCalendarView(calendar: CalendarRow, viewerId?: string) {
  return {
    id: calendar.id,
    name: calendar.name,
    visibility: calendar.visibility,
    ownerAccountId: calendar.owner_account_id,
    isOwner: viewerId ? viewerId === calendar.owner_account_id : undefined,
    isMember: viewerId ? isMember(calendar.id, viewerId) : undefined,
    memberCount: memberCount(calendar.id),
    createdAt: calendar.created_at,
  }
}

// --- Tagging a completion into calendars ----------------------------------

const deleteTagsForCompletion = db.prepare('DELETE FROM completion_calendars WHERE completion_id = ?')
const insertTag = db.prepare('INSERT OR IGNORE INTO completion_calendars (completion_id, calendar_id) VALUES (?, ?)')
const calendarsForCompletionStmt = db.prepare(`
  SELECT c.id, c.name FROM completion_calendars cc JOIN calendars c ON c.id = cc.calendar_id WHERE cc.completion_id = ?
`)

// Replaces the full tag set for a completion — only ever called for a
// completion the caller owns, and only with calendar ids they're a member
// of (both checked by the route before calling this).
export function tagCompletion(completionId: string, calendarIds: string[]): void {
  deleteTagsForCompletion.run(completionId)
  for (const calendarId of calendarIds) insertTag.run(completionId, calendarId)
}

export function calendarsForCompletion(completionId: string): { id: string; name: string }[] {
  return calendarsForCompletionStmt.all(completionId) as { id: string; name: string }[]
}
