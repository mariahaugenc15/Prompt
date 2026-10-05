// Client for server/notificationsRoutes.ts — per-event notification
// preferences plus the in-app notification list (v2 Phase 4).

import { apiUrl } from './apiBase'

export interface NotificationPrefs {
  master: boolean
  newFollower: boolean
  newPrompt: boolean
  promptCompleted: boolean
}

export type NotificationEvent = 'new_follower' | 'new_prompt' | 'prompt_completed'

export interface NotificationItem {
  id: string
  event: NotificationEvent
  title: string
  body: string
  url: string
  isRead: boolean
  createdAt: number
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export function getNotificationPrefs(token: string) {
  return call<NotificationPrefs>('/api/me/notification-prefs', token)
}

export function setNotificationPrefs(prefs: Partial<NotificationPrefs>, token: string) {
  return call<NotificationPrefs>('/api/me/notification-prefs', token, {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  })
}

export function getNotifications(token: string, offset = 0, limit = 30) {
  return call<{ items: NotificationItem[]; unreadCount: number }>(`/api/notifications?limit=${limit}&offset=${offset}`, token)
}

export function markNotificationsRead(token: string) {
  return call<{ ok: true }>('/api/notifications/read', token, { method: 'POST' })
}
