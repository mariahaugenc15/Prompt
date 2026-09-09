import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { PromptLogo } from '../components/PromptLogo'
import { submitLogin } from '../lib/signupApi'

export function Login() {
  const navigate = useNavigate()
  const setAccount = useStore((s) => s.setAccount)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await submitLogin(username.trim(), password)
      if (!result.ok) {
        setError(result.errors.form ?? 'Incorrect username or password.')
        return
      }
      setAccount(result.account)
      navigate(result.account.accountType === 'organization' ? `/o/${result.account.username}` : '/')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <PromptLogo size={30} className="justify-center" />
        <p className="mt-2 text-sm text-ink-soft">Log in to your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="mariah"
            autoFocus
            className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={!username.trim() || !password || submitting}
          className="mt-1 rounded-sm bg-ink py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="text-center text-sm text-ink-faint">
        New here?{' '}
        <Link to="/signup" className="font-medium text-ink underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </div>
  )
}
