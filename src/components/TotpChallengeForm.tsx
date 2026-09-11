import { useState, type FormEvent } from 'react'
import { submitLoginTotp, type SignupSuccess } from '../lib/signupApi'

// The second step of logging into a 2FA-enabled account (or resetting its
// password) — shared by Login.tsx and ResetPassword.tsx since both hand off
// to the same /api/login/totp exchange once a loginToken exists.
export function TotpChallengeForm({
  loginToken,
  onSuccess,
  onCancel,
}: {
  loginToken: string
  onSuccess: (account: SignupSuccess) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await submitLoginTotp(loginToken, code.trim())
      if (result.kind === 'success') {
        onSuccess(result.account)
      } else if (result.kind === 'error') {
        setError(result.errors.form ?? 'Incorrect code.')
      } else {
        setError('Something went wrong. Try logging in again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-center text-sm text-ink-soft">
        Enter the 6-digit code from your authenticator app, or one of your backup codes.
      </p>
      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoFocus
          inputMode="numeric"
          className="rounded-sm border border-line bg-card p-2.5 text-center text-lg normal-case tracking-[0.3em] outline-none focus:border-line-strong"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={!code.trim() || submitting}
        className="mt-1 rounded-sm bg-ink py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Verifying…' : 'Verify'}
      </button>
      <button type="button" onClick={onCancel} className="text-center text-xs text-ink-faint underline underline-offset-2">
        Back
      </button>
    </form>
  )
}
