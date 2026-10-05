import crypto from 'node:crypto'
import { db } from './db.js'
import { notifyAccount } from './pushRepo.js'

export type NotificationEvent = 'new_follower' | 'new_prompt' | 'prompt_completed'

export interface NotificationPrefs {
  master: boolean
  newFollower: boolean
  newPrompt: boolean
  promptCompleted: boolean
}

interface PrefsRow {
  notify_master: number
  notify_new_follower: number
  notify_new_prompt: number
  notify_prompt_completed: number
}

const getPrefsStmt = db.prepare(
  'SELECT notify_master, notify_new_follower, notify_new_prompt, notify_prompt_completed FROM accounts WHERE id = ?',
)

export function getNotificationPrefs(accountId: string): NotificationPrefs {
  const row = getPrefsStmt.get(accountId) as PrefsRow | undefined
  return {
    master: Boolean(row?.notify_master ?? 1),
    newFollower: Boolean(row?.notify_new_follower ?? 1),
    newPrompt: Boolean(row?.notify_new_prompt ?? 1),
    promptCompleted: Boolean(row?.notify_prompt_completed ?? 1),
  }
}

const setPrefsStmt = db.prepare(`
  UPDATE accounts
  SET notify_master = @master, notify_new_follower = @newFollower, notify_new_prompt = @newPrompt, notify_prompt_completed = @promptCompleted
  WHERE id = @accountId
`)

export function setNotificationPrefs(accountId: string, prefs: NotificationPrefs): void {
  setPrefsStmt.run({
    accountId,
    master: prefs.master ? 1 : 0,
    newFollower: prefs.newFollower ? 1 : 0,
    newPrompt: prefs.newPrompt ? 1 : 0,
    promptCompleted: prefs.promptCompleted ? 1 : 0,
  })
}

function allowedFor(prefs: NotificationPrefs, event: NotificationEvent): boolean {
  if (!prefs.master) return false
  if (event === 'new_follower') return prefs.newFollower
  if (event === 'new_prompt') return prefs.newPrompt
  return prefs.promptCompleted
}

const insertNotification = db.prepare(`
  INSERT INTO notifications (id, account_id, event, title, body, url, created_at)
  VALUES (@id, @accountId, @event, @title, @body, @url, @createdAt)
`)

export interface NotificationView {
  id: string
  event: NotificationEvent
  title: string
  body: string
  url: string
  isRead: boolean
  createdAt: number
}

interface NotificationRow {
  id: string
  event: NotificationEvent
  title: string
  body: string
  url: string
  is_read: number
  created_at: number
}

const listStmt = db.prepare('SELECT * FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
const unreadCountStmt = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE account_id = ? AND is_read = 0')
const markAllReadStmt = db.prepare('UPDATE notifications SET is_read = 1 WHERE account_id = ? AND is_read = 0')

export function listNotifications(accountId: string, limit = 50, offset = 0): NotificationView[] {
  return (listStmt.all(accountId, limit, offset) as NotificationRow[]).map((r) => ({
    id: r.id,
    event: r.event,
    title: r.title,
    body: r.body,
    url: r.url,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at,
  }))
}

export function unreadNotificationCount(accountId: string): number {
  return (unreadCountStmt.get(accountId) as { n: number }).n
}

export function markAllNotificationsRead(accountId: string): void {
  markAllReadStmt.run(accountId)
}

// The one entry point every notification-worthy event (Phase 4: new
// follower, new prompt received, your prompt was completed) should call
// instead of pushRepo.ts's notifyAccount directly — it's what actually
// checks the per-event + master preference before doing anything, and
// records the in-app list entry alongside the push attempt. A muted event
// produces neither.
export function notifyForEvent(accountId: string, event: NotificationEvent, title: string, body: string, url = '/'): void {
  if (!allowedFor(getNotificationPrefs(accountId), event)) return
  insertNotification.run({ id: crypto.randomUUID(), accountId, event, title, body, url, createdAt: Date.now() })
  void notifyAccount(accountId, title, body, url)
}
