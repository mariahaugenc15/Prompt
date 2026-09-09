import type { FieldErrors, SignupInput } from '../../shared/signupValidation'

export interface UsernameCheckResult {
  available: boolean
  error?: string
}

export async function checkUsernameAvailable(username: string, signal?: AbortSignal): Promise<UsernameCheckResult> {
  const res = await fetch(`/api/signup/check-username?username=${encodeURIComponent(username)}`, { signal })
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
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (res.ok) return { ok: true, account: body }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}
