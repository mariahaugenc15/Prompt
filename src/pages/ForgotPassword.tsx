import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PromptLogo } from '../components/PromptLogo'
import { BackIcon } from '../components/Icons'
import { requestPasswordReset } from '../lib/signupApi'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <Link to="/login" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to log in
      </Link>

      <div className="text-center">
        <PromptLogo size={30} className="justify-center" />
        <p className="mt-2 text-sm text-ink-soft">Reset your password.</p>
      </div>

      {sent ? (
        <p className="rounded-sm border border-line bg-card p-4 text-center text-sm text-ink-soft">
          If an account exists for that email, a reset link is on its way. It's valid for the next hour.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
            />
          </label>

          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="mt-1 rounded-sm bg-ink py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </div>
  )
}
