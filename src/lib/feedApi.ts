// Client for the unified real activity/feed queries (server/feedRoutes.ts).

import { apiUrl } from './apiBase'
import type { CompletionView } from './calendarsApi'

export type { CompletionView }

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string | undefined): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

// Every one of my own resolved completions (1:1 sent to me + any broadcast
// I've completed) — "All Activity", my own calendar.
export function getMyActivity(token: string) {
  return call<CompletionView[]>('/api/me/activity', token)
}

// 1:1 completions by accounts I follow.
export function getFollowingFeed(token: string) {
  return call<CompletionView[]>('/api/feed/following', token)
}

// Board-broadcast completions from boards I subscribe to.
export function getCommunityFeed(token: string) {
  return call<CompletionView[]>('/api/feed/community', token)
}

// What shows on someone else's public profile.
export function getPublicActivity(username: string, token?: string) {
  return call<CompletionView[]>(`/api/accounts/${encodeURIComponent(username)}/activity`, token)
}
