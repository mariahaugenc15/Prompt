// Client for the "Need an idea?" prompt generator (server/suggestionsRoutes.ts).

import { apiUrl } from './apiBase'
import type { Category } from './types'

export type SuggestionPack = 'chill' | 'brave' | 'silly' | 'outdoors'

export const SUGGESTION_PACKS: SuggestionPack[] = ['chill', 'brave', 'silly', 'outdoors']
export const SUGGESTION_PACK_LABEL: Record<SuggestionPack, string> = {
  chill: 'Chill',
  brave: 'Brave',
  silly: 'Silly',
  outdoors: 'Outdoors',
}

export interface Suggestion {
  id: string
  category: string
  pack: string
  text: string
}

export async function getSuggestion(
  category: Category,
  pack: SuggestionPack,
  excludeIds: string[],
  token: string,
): Promise<Suggestion | undefined> {
  const qs = new URLSearchParams({ category, pack })
  if (excludeIds.length > 0) qs.set('exclude', excludeIds.join(','))
  const res = await fetch(apiUrl(`/api/suggestions?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return undefined
  return (await res.json()) as Suggestion
}
