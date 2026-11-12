// Client for server/recapRoutes.ts (v2 Phase 11).

import { apiUrl } from './apiBase'

export interface RecapData {
  monthKey: string
  thin: boolean
  totalCompletions: number
  completionScore: number | null
  favoriteCategory: string | null
  longestStreakDays: number
  mostLaughedAt: { completionId: string; text: string; laughs: number } | null
  topFriend: { username: string; displayName: string; exchangeCount: number } | null
}

export async function getRecap(monthKey: string, token: string): Promise<RecapData | undefined> {
  const res = await fetch(apiUrl(`/api/recap/${monthKey}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return undefined
  return (await res.json()) as RecapData
}
