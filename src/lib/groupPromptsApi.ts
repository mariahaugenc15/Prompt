// Client for server/groupPromptsRoutes.ts (v2 Phase 12: group prompts +
// sealed reveals).

import { apiUrl } from './apiBase'
import type { Category } from './types'

export type DeadlineHours = 24 | 48 | 168

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

export function sendGroupPrompt(
  input: { recipientUsernames: string[]; category: Category; text: string; sealed: boolean; deadlineHours?: DeadlineHours },
  token: string,
) {
  return call<{ id: string }>('/api/prompts/group', token, { method: 'POST', body: JSON.stringify(input) })
}

export interface SentGroupItem {
  id: string
  category: Category
  text: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  createdAt: number
  total: number
  completed: number
}

export function getSentGroupPrompts(token: string) {
  return call<SentGroupItem[]>('/api/prompt-groups/sent', token)
}

export interface ReceivedGroupItem {
  groupId: string
  promptId: string
  category: Category
  text: string
  senderUsername: string
  senderDisplayName: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  createdAt: number
  total: number
  completed: number
  myStatus: 'pending' | 'completed' | 'declined' | 'expired'
  late: boolean
}

export function getReceivedGroupPrompts(token: string) {
  return call<ReceivedGroupItem[]>('/api/prompt-groups/received', token)
}

export interface GroupDetailResponse {
  username: string
  displayName: string
  status: string
  isMine: boolean
  late: boolean
  mediaType?: string
  mediaDataUrl?: string
  autoCaption?: string
  userCaption?: string
}

export interface GroupDetail {
  id: string
  category: Category
  text: string
  sealed: boolean
  deadlineAt: number | null
  revealedAt: number | null
  cancelled: boolean
  isSender: boolean
  senderUsername: string
  total: number
  completed: number
  responses: GroupDetailResponse[]
}

export function getGroupDetail(groupId: string, token: string) {
  return call<GroupDetail>(`/api/prompt-groups/${encodeURIComponent(groupId)}`, token)
}

export function cancelGroupPrompt(groupId: string, token: string) {
  return call<{ ok: true }>(`/api/prompt-groups/${encodeURIComponent(groupId)}/cancel`, token, { method: 'POST' })
}
