import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { PromptLogo } from '../components/PromptLogo'
import { BackIcon } from '../components/Icons'
import { TotpChallengeForm } from '../components/TotpChallengeForm'
import { confirmPasswordReset, type SignupSuccess } from '../lib/signupApi'

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAccount = useStore((s) => s.setAccount)
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loginToken, setLoginToken] = useState<string | null>(null)

  function finishReset(account: SignupSuccess) {
    setAccount(account)
    navigate(account.accountType === 'organization' ? `/o/${account.username}` : '/')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const result = await confirmPasswordReset(token, password)
      if (result.kind === 'totp') {
        setLoginToken(result.loginToken)
      } else if (result.kind === 'error') {
        setError(result.errors.newPassword ?? result.errors.form ?? 'Could not reset your password.')
      } else {
        finishReset(result.account)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6 text-center">
        <PromptLogo size={30} className="justify-center" />
        <p className="text-sm text-ink-soft">
          That reset link is missing its token. Request a new one from{' '}
          <Link to="/forgot-password" className="underline">
            here
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <Link to="/login" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to log in
      </Link>

      <div className="text-center">
        <PromptLogo size={30} className="justify-center" />
        <p className="mt-2 text-sm text-ink-soft">{loginToken ? "Verify it's you." : 'Choose a new password.'}</p>
      </div>

      {loginToken ? (
        <TotpChallengeForm loginToken={loginToken} onSuccess={finishReset} onCancel={() => setLoginToken(null)} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={!password || !confirm || submitting}
            className="mt-1 rounded-sm bg-ink py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
          >
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      )}
    </div>
  )
}
