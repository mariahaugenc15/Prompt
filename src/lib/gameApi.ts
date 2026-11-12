// Client for server/gameRoutes.ts (v2 Phase 13.2: weekly leaderboard game).

import { apiUrl } from './apiBase'

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

export interface GameSettings {
  boardId: string
  enabled: boolean
  timezone: string
  hideRanks: boolean
  disabledByAdmin: boolean
}

export function getGameSettings(boardId: string, token?: string) {
  return call<GameSettings>(`/api/boards/${encodeURIComponent(boardId)}/game`, token)
}

export function setGameSettings(boardId: string, input: { enabled: boolean; timezone: string; hideRanks: boolean }, token: string) {
  return call<GameSettings>(`/api/boards/${encodeURIComponent(boardId)}/game`, token, { method: 'PATCH', body: JSON.stringify(input) })
}

export interface LeaderboardEntry {
  username: string
  displayName: string
  completions: number
  points?: number
  rank?: number
}

export interface Leaderboard {
  hideRanks: boolean
  weekStart: number
  weekEnd: number
  myOptedOut: boolean
  entries: LeaderboardEntry[]
}

export function getLeaderboard(boardId: string, token?: string) {
  return call<Leaderboard>(`/api/boards/${encodeURIComponent(boardId)}/game/leaderboard`, token)
}

export interface PastWeek {
  id: string
  weekStart: number
  weekEnd: number
  winner: { username: string; displayName: string; points: number } | null
}

export function getPastWeeks(boardId: string, token?: string) {
  return call<PastWeek[]>(`/api/boards/${encodeURIComponent(boardId)}/game/weeks`, token)
}

export function setOptOut(boardId: string, optOut: boolean, token: string) {
  return call<{ ok: true; optedOut: boolean }>(`/api/boards/${encodeURIComponent(boardId)}/game/opt-out`, token, {
    method: 'POST',
    body: JSON.stringify({ optOut }),
  })
}
