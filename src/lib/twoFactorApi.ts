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

export interface TotpSetup {
  secret: string
  otpauthUrl: string
}

export function startTwoFactorSetup(token: string) {
  return call<TotpSetup>('/api/me/2fa/setup', token, { method: 'POST' })
}

export function confirmTwoFactorSetup(code: string, token: string) {
  return call<{ ok: true; backupCodes: string[] }>('/api/me/2fa/confirm', token, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function disableTwoFactor(password: string, token: string) {
  return call<{ ok: true }>('/api/me/2fa/disable', token, { method: 'POST', body: JSON.stringify({ password }) })
}
