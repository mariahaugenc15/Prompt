// Client for server/teamChallengeRoutes.ts (v2 Phase 13.3).

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

export interface ChallengeSummary {
  id: string
  board_id: string
  name: string
  period_start: number
  period_end: number
  status: 'active' | 'ended'
  created_by: string
  created_at: number
}

export function createTeamChallenge(boardId: string, input: { name: string; teamCount: number; periodDays: number }, token: string) {
  return call<ChallengeSummary>(`/api/boards/${encodeURIComponent(boardId)}/team-challenges`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getTeamChallenges(boardId: string, token?: string) {
  return call<ChallengeSummary[]>(`/api/boards/${encodeURIComponent(boardId)}/team-challenges`, token)
}

export interface TeamStanding {
  teamId: string
  name: string
  memberCount: number
  memberDisplayNames: string[]
  totalPoints: number
  averagePoints: number
  rank: number
}

export interface ChallengeDetail extends ChallengeSummary {
  standings: TeamStanding[]
}

export function getTeamChallengeDetail(id: string, token?: string) {
  return call<ChallengeDetail>(`/api/team-challenges/${encodeURIComponent(id)}`, token)
}
