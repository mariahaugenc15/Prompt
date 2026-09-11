// Client for the real, server-backed boards system (server/boardsRoutes.ts) —
// a public board created here is genuinely discoverable and joinable by any
// account on the app, not just visible on the creator's own device.

import { apiUrl } from './apiBase'
import type { BoardCategory, Category } from './types'

export interface RealBoard {
  id: string
  name: string
  description: string
  category: BoardCategory
  visibility: 'public' | 'invite'
  locationTag?: string
  icon?: string
  ownerUsername: string
  ownerDisplayName: string
  subscriberCount: number
  isSubscribed?: boolean
  isOwner?: boolean
  createdAt: number
}

export interface BoardChallenge {
  id: string
  category: Category
  text: string
  cadence: 'one-off' | 'daily' | 'weekly'
  createdAt: number
  participationCount: number
  completions: {
    id: string
    autoCaption: string
    userCaption?: string
    mediaType: string
    mediaDataUrl: string
    createdAt: number
    completerUsername: string
    upvotes: number
    pins: number
    upvotedByMe: boolean
    pinnedByMe: boolean
  }[]
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
  input: { name: string; description: string; category: BoardCategory; visibility: 'public' | 'invite'; locationTag?: string; icon?: string },
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

export function postBoardChallenge(
  id: string,
  input: { category: Category; text: string; cadence: 'one-off' | 'daily' | 'weekly' },
  token: string,
) {
  return call<{ id: string; category: Category; text: string; cadence: string; status: string; boardId: string }>(
    `/api/boards/${encodeURIComponent(id)}/challenges`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function getBoardChallenges(id: string, token?: string) {
  return call<BoardChallenge[]>(`/api/boards/${encodeURIComponent(id)}/challenges`, token)
}

export interface DiscoverableChallenge {
  id: string
  category: Category
  text: string
  cadence: 'one-off' | 'daily' | 'weekly'
  createdAt: number
  boardId: string
  boardName: string
  boardIcon?: string
  ownerDisplayName: string
}

export function discoverChallenges(limit = 30) {
  return call<DiscoverableChallenge[]>(`/api/boards/discover/challenges?limit=${limit}`, undefined)
}
