// Client for the stamps system (server/stampsRoutes.ts, Phase 8).

import { apiUrl } from './apiBase'
import type { Category } from './types'

export interface StampBookEntry {
  category: Category
  count: number
  earned: boolean
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string | undefined): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export function getStampBook(username: string, token: string | undefined) {
  return call<StampBookEntry[]>(`/api/accounts/${encodeURIComponent(username)}/stamps`, token)
}
