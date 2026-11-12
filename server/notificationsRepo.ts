import crypto from 'node:crypto'
import { db } from './db.js'
import { notifyAccount } from './pushRepo.js'
import { sendWidgetRefreshPush, sendAlertPush } from './apnsRepo.js'

export type NotificationEvent =
  | 'new_follower'
  | 'new_prompt'
  | 'prompt_completed'
  | 'monthly_recap'
  | 'sealed_reveal'
  | 'game_started'
  | 'game_week_ended'
  | 'game_overtaken'
  | 'game_winner'

export interface NotificationPrefs {
  master: boolean
  newFollower: boolean
  newPrompt: boolean
  promptCompleted: boolean
  monthlyRecap: boolean
  sealedReveal: boolean
  gameUpdates: boolean
}

// Maps each NotificationPrefs field to its row key in notification_prefs
// (server/db.ts). Adding a future notification type means adding one
// entry here and to NotificationPrefs, never a migration. The four
// Phase 13 game events (started, week ended, overtaken, winner) share a
// single gameUpdates toggle rather than one each — the spec's own
// "throttle them so they are never spammy" is best served by one clear
// on/off for "game stuff" instead of four separate switches to manage.
const PREF_FIELDS: { field: keyof NotificationPrefs; event: string }[] = [
  { field: 'master', event: 'master' },
  { field: 'newFollower', event: 'new_follower' },
  { field: 'newPrompt', event: 'new_prompt' },
  { field: 'promptCompleted', event: 'prompt_completed' },
  { field: 'monthlyRecap', event: 'monthly_recap' },
  { field: 'sealedReveal', event: 'sealed_reveal' },
  { field: 'gameUpdates', event: 'game_updates' },
]

const getAllPrefsStmt = db.prepare('SELECT event, enabled FROM notification_prefs WHERE account_id = ?')

export function getNotificationPrefs(accountId: string): NotificationPrefs {
  // No row for an event means "on" (see db.ts's migration comment) — same
  // default the old fixed columns used, so an account with nothing ever
  // explicitly set behaves exactly as before.
  const enabled = new Map((getAllPrefsStmt.all(accountId) as { event: string; enabled: number }[]).map((r) => [r.event, Boolean(r.enabled)]))
  const prefs = {} as NotificationPrefs
  for (const { field, event } of PREF_FIELDS) prefs[field] = enabled.get(event) ?? true
  return prefs
}

const upsertPrefStmt = db.prepare(`
  INSERT INTO notification_prefs (account_id, event, enabled) VALUES (@accountId, @event, @enabled)
  ON CONFLICT(account_id, event) DO UPDATE SET enabled = @enabled
`)

export function setNotificationPrefs(accountId: string, prefs: NotificationPrefs): void {
  for (const { field, event } of PREF_FIELDS) {
    upsertPrefStmt.run({ accountId, event, enabled: prefs[field] ? 1 : 0 })
  }
}

function allowedFor(prefs: NotificationPrefs, event: NotificationEvent): boolean {
  if (!prefs.master) return false
  if (event === 'new_follower') return prefs.newFollower
  if (event === 'new_prompt') return prefs.newPrompt
  if (event === 'monthly_recap') return prefs.monthlyRecap
  if (event === 'sealed_reveal') return prefs.sealedReveal
  if (event === 'game_started' || event === 'game_week_ended' || event === 'game_overtaken' || event === 'game_winner') return prefs.gameUpdates
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
  // Web Push reaches a browser or installed PWA; it never reaches a
  // Capacitor-wrapped native app (see apnsRepo.ts's module comment), so
  // the native-iOS equivalent is the separate sendAlertPush call below.
  void notifyAccount(accountId, title, body, url)
  // A real, user-visible alert push for any native-app device whose user
  // granted notification permission.
  void sendAlertPush(accountId, title, body, url)
  // A silent APNs push to every registered native-app device regardless
  // of that permission, so the home-screen widget's "post-it notes"
  // refresh close to immediately instead of waiting on iOS's own
  // background-refresh schedule. A no-op wherever APNs isn't configured
  // or the account has no device tokens.
  void sendWidgetRefreshPush(accountId)
}
