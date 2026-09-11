import { apiUrl } from './apiBase'

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export type VerificationCategory = 'organization' | 'public_figure' | 'other'

export interface VerificationStatus {
  isVerified: boolean
  followerCount: number
  minFollowersRequired: number
  latestRequest: {
    status: 'pending' | 'approved' | 'rejected'
    category: VerificationCategory
    reviewNote?: string
    createdAt: number
  } | null
}

export function getVerificationStatus(token: string) {
  return call<VerificationStatus>('/api/verification/status', token)
}

export function requestVerification(
  input: { category: VerificationCategory; links: string; explanation: string },
  token: string,
) {
  return call<{ ok: true }>('/api/verification/request', token, { method: 'POST', body: JSON.stringify(input) })
}
