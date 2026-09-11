// Client for the real, server-backed boards system (server/boardsRoutes.ts) —
// a public board created here is genuinely discoverable and joinable by any
// account on the app, not just visible on the creator's own device.

import { apiUrl } from './apiBase'
import type { BoardCategory } from './types'

export interface RealBoard {
  id: string
  name: string
  description: string
  category: BoardCategory
  visibility: 'public' | 'invite'
  locationTag?: string
  ownerUsername: string
  ownerDisplayName: string
  subscriberCount: number
  isSubscribed?: boolean
  isOwner?: boolean
  createdAt: number
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

export function createBoard(
  input: { name: string; description: string; category: BoardCategory; visibility: 'public' | 'invite'; locationTag?: string },
  token: string,
) {
  return call<RealBoard>('/api/boards', token, { method: 'POST', body: JSON.stringify(input) })
}

export function discoverBoards(token?: string) {
  return call<RealBoard[]>('/api/boards/discover', token)
}

export function searchBoards(query: string, token?: string) {
  return call<RealBoard[]>(`/api/search/boards?q=${encodeURIComponent(query)}`, token)
}

export function getMyBoards(token: string) {
  return call<RealBoard[]>('/api/boards/mine', token)
}

export function getBoard(id: string, token?: string) {
  return call<RealBoard>(`/api/boards/${encodeURIComponent(id)}`, token)
}

export function subscribeBoard(id: string, token: string) {
  return call<RealBoard>(`/api/boards/${encodeURIComponent(id)}/subscribe`, token, { method: 'POST' })
}

export function inviteToBoard(id: string, username: string, token: string) {
  return call<RealBoard>(`/api/boards/${encodeURIComponent(id)}/invite`, token, {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}
