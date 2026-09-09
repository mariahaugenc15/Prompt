import type { FieldErrors, SignupInput } from '../../shared/signupValidation'
import { apiUrl } from './apiBase'

export interface UsernameCheckResult {
  available: boolean
  error?: string
}

export async function checkUsernameAvailable(username: string, signal?: AbortSignal): Promise<UsernameCheckResult> {
  const res = await fetch(apiUrl(`/api/signup/check-username?username=${encodeURIComponent(username)}`), { signal })
  return res.json()
}

export interface SignupSuccess {
  id: string
  accountType: SignupInput['accountType']
  username: string
  email: string
  firstName?: string
  organizationName?: string
  // v1 stand-in for a real session (see server/auth.ts) — sent back as
  // `Authorization: Bearer <token>` on every real-account/prompt request.
  token: string
}

export type SignupResult = { ok: true; account: SignupSuccess } | { ok: false; errors: FieldErrors }

export async function submitSignup(input: SignupInput): Promise<SignupResult> {
  const res = await fetch(apiUrl('/api/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (res.ok) return { ok: true, account: body }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export async function submitLogin(username: string, password: string): Promise<SignupResult> {
  const res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  if (res.ok) return { ok: true, account: body }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}
