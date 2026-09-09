// Client for the real, server-enforced account/prompt system (Section 8:
// individual-to-individual send/complete/auto-tag, organization broadcast).
// Distinct from src/lib/store.ts, which still drives the mock calendar/feed
// prototype — this one talks to server/*.ts and requires the bearer token
// minted at sign-up (src/lib/signupApi.ts).

import { apiUrl } from './apiBase'

export type Category = 'snap' | 'sound' | 'show' | 'share' | 'unplug'

export interface PublicProfile {
  id: string
  username: string
  accountType: 'individual' | 'organization'
  displayName: string
  websiteUrl?: string
  followerCount: number
  followingCount: number
  isFollowing?: boolean
}

export interface InboxItem {
  id: string
  isBroadcast: boolean
  category: Category
  text: string
  createdAt: number
  senderUsername: string
  senderDisplayName: string
}

export interface CompletionResult {
  promptId: string
  completionId?: string
  senderUsername: string
  senderDisplayName: string
  completerUsername: string
  completerDisplayName: string
  category: Category
  promptText: string
  autoCaption: string
  userCaption?: string
  mediaType: string
  mediaDataUrl: string
}

export interface BroadcastSummary {
  id: string
  category: Category
  text: string
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

export interface Me {
  id: string
  username: string
  accountType: 'individual' | 'organization'
  displayName: string
  email: string
  promptPermission: 'everyone' | 'followers' | 'mutuals'
}

export function getMe(token: string) {
  return call<Me>('/api/me', token)
}

export function getProfile(username: string, token?: string) {
  return call<PublicProfile>(`/api/accounts/${encodeURIComponent(username)}`, token)
}

export function follow(username: string, token: string) {
  return call<PublicProfile>('/api/follow', token, { method: 'POST', body: JSON.stringify({ username }) })
}

export function unfollow(username: string, token: string) {
  return call<PublicProfile>(`/api/follow/${encodeURIComponent(username)}`, token, { method: 'DELETE' })
}

export function setMyPromptPermission(promptPermission: 'everyone' | 'followers' | 'mutuals', token: string) {
  return call<{ promptPermission: string }>('/api/me/prompt-permission', token, {
    method: 'PATCH',
    body: JSON.stringify({ promptPermission }),
  })
}

export function sendOneToOnePrompt(
  input: { recipientUsername: string; category: Category; text: string },
  token: string,
) {
  return call<{ id: string; status: string }>('/api/prompts', token, { method: 'POST', body: JSON.stringify(input) })
}

export function sendBroadcast(input: { category: Category; text: string }, token: string) {
  return call<{ id: string; status: string }>('/api/prompts/broadcast', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getInbox(token: string) {
  return call<InboxItem[]>('/api/prompts/inbox', token)
}

export function declinePrompt(id: string, token: string) {
  return call<{ id: string; status: string }>(`/api/prompts/${id}/decline`, token, { method: 'POST' })
}

export function completePrompt(
  id: string,
  input: { mediaType: string; mediaDataUrl: string; caption?: string },
  token: string,
) {
  return call<CompletionResult>(`/api/prompts/${id}/complete`, token, { method: 'POST', body: JSON.stringify(input) })
}

export function getOrganizationBroadcasts(username: string) {
  return call<BroadcastSummary[]>(`/api/organizations/${encodeURIComponent(username)}/broadcasts`, undefined)
}
