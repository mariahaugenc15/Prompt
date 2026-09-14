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
  avatarUrl?: string
  bio?: string
  followerCount: number
  followingCount: number
  isFollowing?: boolean
  blockedByMe?: boolean
  isVerified: boolean
  profileVisibility: 'public' | 'private'
  canViewActivity: boolean
}

export type PromptStatus = 'pending' | 'completed' | 'declined' | 'expired'

// A single real, 1:1 prompt from your point of view — whichever side of it
// you're on. Backs the fridge-note strip on Home: every prompt anyone sent
// you (any status) shows there so there's nowhere else to go dig one up.
export interface OneToOneHistoryItem {
  id: string
  category: Category
  promptText: string
  status: PromptStatus
  autoCaption?: string
  userCaption?: string
  mediaType?: string
  mediaDataUrl?: string
  createdAt: number
  completedAt?: number
  senderUsername: string
  senderDisplayName: string
  recipientUsername: string
}

export interface PromptHistory {
  oneToOne: OneToOneHistoryItem[]
  broadcasts: {
    id: string
    category: Category
    promptText: string
    autoCaption: string
    userCaption?: string
    mediaType: string
    mediaDataUrl: string
    completedAt: number
    senderUsername: string
    completerUsername: string
  }[]
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
  profileVisibility: 'public' | 'private'
  isAdmin: boolean
  isVerified: boolean
  totpEnabled: boolean
}

export function getMe(token: string) {
  return call<Me>('/api/me', token)
}

export function getProfile(username: string, token?: string) {
  return call<PublicProfile>(`/api/accounts/${encodeURIComponent(username)}`, token)
}

export function searchAccounts(query: string, token?: string) {
  return call<PublicProfile[]>(`/api/search/accounts?q=${encodeURIComponent(query)}`, token)
}

export function listAccounts(token?: string) {
  return call<PublicProfile[]>('/api/accounts', token)
}

export function getFollowers(username: string, token?: string) {
  return call<PublicProfile[]>(`/api/accounts/${encodeURIComponent(username)}/followers`, token)
}

export function getFollowing(username: string, token?: string) {
  return call<PublicProfile[]>(`/api/accounts/${encodeURIComponent(username)}/following`, token)
}

export function follow(username: string, token: string) {
  return call<PublicProfile>('/api/follow', token, { method: 'POST', body: JSON.stringify({ username }) })
}

export function unfollow(username: string, token: string) {
  return call<PublicProfile>(`/api/follow/${encodeURIComponent(username)}`, token, { method: 'DELETE' })
}

export function blockAccount(username: string, token: string) {
  return call<{ blocked: true }>(`/api/block/${encodeURIComponent(username)}`, token, { method: 'POST' })
}

export function unblockAccount(username: string, token: string) {
  return call<{ blocked: false }>(`/api/block/${encodeURIComponent(username)}`, token, { method: 'DELETE' })
}

export function getBlockedAccounts(token: string) {
  return call<PublicProfile[]>('/api/me/blocked', token)
}

export function reportContent(input: { targetType: 'account' | 'completion' | 'board' | 'comment'; targetId: string; reason: string }, token: string) {
  return call<{ ok: true }>('/api/report', token, { method: 'POST', body: JSON.stringify(input) })
}

export function submitFeedback(message: string, token: string) {
  return call<{ ok: true }>('/api/feedback', token, { method: 'POST', body: JSON.stringify({ message }) })
}

export function updateMyAvatar(dataUrl: string | undefined, token: string) {
  return call<{ avatarUrl?: string }>('/api/me/avatar', token, { method: 'PATCH', body: JSON.stringify({ dataUrl }) })
}

export function updateMyBio(bio: string, token: string) {
  return call<{ bio?: string }>('/api/me/bio', token, { method: 'PATCH', body: JSON.stringify({ bio }) })
}

export function logout(token: string) {
  return call<{ ok: true }>('/api/logout', token, { method: 'POST' })
}

export function deleteMyAccount(token: string) {
  return call<{ ok: true }>('/api/me', token, { method: 'DELETE' })
}

export function unsendPrompt(id: string, token: string) {
  return call<{ id: string }>(`/api/prompts/${id}`, token, { method: 'DELETE' })
}

export function declinePrompt(id: string, token: string) {
  return call<{ id: string; status: string }>(`/api/prompts/${id}/decline`, token, { method: 'POST' })
}

export function setMyPromptPermission(promptPermission: 'everyone' | 'followers' | 'mutuals', token: string) {
  return call<{ promptPermission: string }>('/api/me/prompt-permission', token, {
    method: 'PATCH',
    body: JSON.stringify({ promptPermission }),
  })
}

export function setMyProfileVisibility(profileVisibility: 'public' | 'private', token: string) {
  return call<{ profileVisibility: string }>('/api/me/profile-visibility', token, {
    method: 'PATCH',
    body: JSON.stringify({ profileVisibility }),
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

export function getPromptHistory(token: string) {
  return call<PromptHistory>('/api/prompts/history', token)
}

export interface ActiveBroadcastItem {
  id: string
  isBroadcast: true
  category: Category
  text: string
  createdAt: number
  senderUsername: string
  senderDisplayName: string
  boardId?: string
  boardName?: string
}

// Broadcasts (organization or board) available to me that I haven't
// completed yet — pending 1:1 prompts come from getPromptHistory instead,
// so this is filtered to isBroadcast only.
export async function getActiveBroadcasts(token: string): Promise<{ ok: true; data: ActiveBroadcastItem[] } | { ok: false; errors: Record<string, string> }> {
  const res = await call<(ActiveBroadcastItem | { isBroadcast: false })[]>('/api/prompts/inbox', token)
  if (!res.ok) return res
  return { ok: true, data: res.data.filter((item): item is ActiveBroadcastItem => item.isBroadcast) }
}

export function completePrompt(
  id: string,
  input: { mediaType?: string; mediaDataUrl?: string; caption?: string },
  token: string,
) {
  return call<CompletionResult>(`/api/prompts/${id}/complete`, token, { method: 'POST', body: JSON.stringify(input) })
}

export function getOrganizationBroadcasts(username: string) {
  return call<BroadcastSummary[]>(`/api/organizations/${encodeURIComponent(username)}/broadcasts`, undefined)
}

export function suggestedAccounts(token: string, limit = 10) {
  return call<PublicProfile[]>(`/api/accounts/suggested?limit=${limit}`, token)
}

export function getCompletionScore(token: string) {
  return call<{ score: number | null; completed: number; total: number }>('/api/me/completion-score', token)
}

// --- Push notifications ----------------------------------------------------

export function getPushPublicKey() {
  return call<{ publicKey: string }>('/api/push/public-key', undefined)
}

export function subscribeToPush(subscription: PushSubscriptionJSON, token: string) {
  return call<{ ok: true }>('/api/push/subscribe', token, { method: 'POST', body: JSON.stringify(subscription) })
}

export function unsubscribeFromPush(endpoint: string, token: string) {
  return call<{ ok: true }>('/api/push/unsubscribe', token, { method: 'POST', body: JSON.stringify({ endpoint }) })
}
