// Client for the real, server-backed calendars system (server/calendarsRoutes.ts).

import { apiUrl } from './apiBase'
import type { Category } from './types'

export interface RealCalendar {
  id: string
  name: string
  visibility: 'public' | 'private'
  ownerAccountId: string
  isOwner?: boolean
  isMember?: boolean
  memberCount: number
  createdAt: number
  members?: { id: string; username?: string; displayName: string }[]
}

export interface CompletionView {
  id: string
  kind: '1:1' | 'broadcast'
  category: Category
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

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string | undefined, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export function createCalendar(name: string, visibility: 'public' | 'private', token: string) {
  return call<RealCalendar>('/api/calendars', token, { method: 'POST', body: JSON.stringify({ name, visibility }) })
}

export function getMyCalendars(token: string) {
  return call<RealCalendar[]>('/api/calendars/mine', token)
}

export function discoverCalendars(token: string, offset = 0, limit = 50) {
  return call<RealCalendar[]>(`/api/calendars/discover?limit=${limit}&offset=${offset}`, token)
}

export function getCalendar(id: string, token?: string) {
  return call<RealCalendar>(`/api/calendars/${encodeURIComponent(id)}`, token)
}

export function getCalendarFeed(id: string, token?: string) {
  return call<CompletionView[]>(`/api/calendars/${encodeURIComponent(id)}/feed`, token)
}

export function joinCalendar(id: string, token: string) {
  return call<RealCalendar>(`/api/calendars/${encodeURIComponent(id)}/join`, token, { method: 'POST' })
}

export function leaveCalendar(id: string, token: string) {
  return call<RealCalendar>(`/api/calendars/${encodeURIComponent(id)}/leave`, token, { method: 'POST' })
}

export function setCalendarVisibility(id: string, visibility: 'public' | 'private', token: string) {
  return call<RealCalendar>(`/api/calendars/${encodeURIComponent(id)}/visibility`, token, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  })
}

export function tagCompletion(completionId: string, calendarIds: string[], token: string) {
  return call<{ calendarIds: string[] }>(`/api/completions/${encodeURIComponent(completionId)}/calendars`, token, {
    method: 'POST',
    body: JSON.stringify({ calendarIds }),
  })
}

export function reactToCompletion(completionId: string, kind: 'upvote' | 'pin', token: string) {
  return call<{ upvotes: number; pins: number; upvotedByMe: boolean; pinnedByMe: boolean }>(
    `/api/completions/${encodeURIComponent(completionId)}/react`,
    token,
    { method: 'POST', body: JSON.stringify({ kind }) },
  )
}
