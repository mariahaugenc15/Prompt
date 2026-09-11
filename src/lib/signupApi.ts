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

// A correct password (or reset) on a 2FA-enabled account doesn't finish
// logging in — it comes back as 'totp' with a loginToken, and the caller
// needs one more round trip (submitLoginTotp) with a code from the
// account's authenticator app or a backup code.
export type LoginOutcome =
  | { kind: 'success'; account: SignupSuccess }
  | { kind: 'totp'; loginToken: string }
  | { kind: 'error'; errors: FieldErrors }

async function parseLoginOutcome(res: Response): Promise<LoginOutcome> {
  const body = await res.json().catch(() => ({}))
  if (res.ok) {
    if (body.requiresTotp) return { kind: 'totp', loginToken: body.loginToken }
    return { kind: 'success', account: body }
  }
  return { kind: 'error', errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export async function submitLogin(username: string, password: string): Promise<LoginOutcome> {
  const res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return parseLoginOutcome(res)
}

export async function submitLoginTotp(loginToken: string, code: string): Promise<LoginOutcome> {
  const res = await fetch(apiUrl('/api/login/totp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginToken, code }),
  })
  return parseLoginOutcome(res)
}

// Always resolves ok — the server responds identically whether or not the
// email has an account, so a caller can never tell from this alone.
export async function requestPasswordReset(email: string): Promise<void> {
  await fetch(apiUrl('/api/password-reset/request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<LoginOutcome> {
  const res = await fetch(apiUrl('/api/password-reset/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  })
  return parseLoginOutcome(res)
}
