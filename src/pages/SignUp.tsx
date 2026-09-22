import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { PromptLogo } from '../components/PromptLogo'
import { CheckIcon, CloseIcon, BackIcon } from '../components/Icons'
import { checkUsernameAvailable, submitSignup } from '../lib/signupApi'
import {
  validateEmailFormat,
  validatePassword,
  validateSignupFields,
  validateUsernameFormat,
  validateWebsiteUrlFormat,
  type AccountType,
  type FieldErrors,
} from '../../shared/signupValidation'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

export function SignUp() {
  const navigate = useNavigate()
  const setAccount = useStore((s) => s.setAccount)

  const [accountType, setAccountType] = useState<AccountType>('individual')
  const [firstName, setFirstName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [errors, setErrors] = useState<FieldErrors>({})
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const checkSeq = useRef(0)

  // Real-time, debounced availability check as the user types. This is a
  // UX convenience only — the server re-checks (and is the actual gate) on
  // submit, since this result can go stale between now and then.
  useEffect(() => {
    const formatError = validateUsernameFormat(username)
    if (formatError) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const mySeq = ++checkSeq.current
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailable(username)
        if (checkSeq.current !== mySeq) return // a newer keystroke superseded this check
        setUsernameStatus(result.available ? 'available' : 'taken')
      } catch {
        if (checkSeq.current === mySeq) setUsernameStatus('idle')
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [username])

  function clearError(field: string) {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const input =
      accountType === 'individual'
        ? ({ accountType, firstName, username, email, password } as const)
        : ({ accountType, organizationName, websiteUrl, username, email, password } as const)

    const clientErrors = validateSignupFields(input)
    if (usernameStatus === 'taken' && !clientErrors.username) {
      clientErrors.username = 'That username is already taken.'
    }
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    setSubmitting(true)
    try {
      const result = await submitSignup(input)
      if (!result.ok) {
        setErrors(result.errors)
        if (result.errors.form) setSubmitError(result.errors.form)
        return
      }
      setAccount(result.account)
      // Organizations get a page, not a personal calendar (Section 8.3) —
      // individuals continue into the existing calendar/onboarding flow.
      navigate(result.account.accountType === 'organization' ? `/o/${result.account.username}` : '/')
    } finally {
      setSubmitting(false)
    }
  }

  const usernameFormatError = errors.username

  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-sm flex-col gap-6 p-6">
      <Link to="/" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back
      </Link>

      <div className="text-center">
        <PromptLogo size={30} className="justify-center" />
        <p className="mt-2 text-sm text-ink-soft">Create your account.</p>
      </div>

      <div className="flex rounded-full border border-line p-1">
        {(['individual', 'organization'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setAccountType(t)
              setErrors({})
            }}
            className={clsx(
              'flex-1 rounded-full py-2 text-sm capitalize transition',
              accountType === t ? 'bg-ink text-paper' : 'text-ink-soft',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {accountType === 'individual' ? (
          <Field label="First name" error={errors.firstName}>
            <input
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                clearError('firstName')
              }}
              placeholder="Maria"
              className={inputClass(Boolean(errors.firstName))}
            />
          </Field>
        ) : (
          <>
            <Field label="Organization name" error={errors.organizationName}>
              <input
                value={organizationName}
                onChange={(e) => {
                  setOrganizationName(e.target.value)
                  clearError('organizationName')
                }}
                placeholder="Field Notes Coffee"
                className={inputClass(Boolean(errors.organizationName))}
              />
            </Field>
            <Field
              label="Website URL"
              error={errors.websiteUrl}
              onBlur={() => {
                const err = validateWebsiteUrlFormat(websiteUrl)
                if (err) setErrors((prev) => ({ ...prev, websiteUrl: err }))
              }}
            >
              <input
                value={websiteUrl}
                onChange={(e) => {
                  setWebsiteUrl(e.target.value)
                  clearError('websiteUrl')
                }}
                placeholder="fieldnotescoffee.com"
                className={inputClass(Boolean(errors.websiteUrl))}
              />
            </Field>
          </>
        )}

        <Field
          label="Username"
          error={usernameFormatError}
          hint={
            !username.trim()
              ? 'Letters, numbers, underscores, periods. Shared by everyone, individuals and organizations alike.'
              : usernameStatus === 'checking'
                ? 'Checking availability…'
                : undefined
          }
        >
          <div className="relative">
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                clearError('username')
              }}
              placeholder="mariah"
              className={inputClass(Boolean(usernameFormatError) || usernameStatus === 'taken')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {usernameStatus === 'available' && !usernameFormatError && <CheckIcon size={16} className="text-success" />}
              {usernameStatus === 'taken' && <CloseIcon size={16} className="text-danger" />}
            </span>
          </div>
          {!usernameFormatError && usernameStatus === 'taken' && (
            <p className="mt-1 text-xs text-danger">That username is already taken.</p>
          )}
          {!usernameFormatError && usernameStatus === 'available' && username.trim() && (
            <p className="mt-1 text-xs text-success">Username is available.</p>
          )}
        </Field>

        <Field
          label="Email"
          error={errors.email}
          onBlur={() => {
            const err = validateEmailFormat(email)
            if (err) setErrors((prev) => ({ ...prev, email: err }))
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              clearError('email')
            }}
            placeholder="you@example.com"
            className={inputClass(Boolean(errors.email))}
          />
        </Field>

        <Field
          label="Password"
          error={errors.password}
          hint={!errors.password ? 'At least 8 characters, with a letter and a number.' : undefined}
          onBlur={() => {
            const err = validatePassword(password)
            if (err) setErrors((prev) => ({ ...prev, password: err }))
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError('password')
            }}
            placeholder="••••••••"
            className={inputClass(Boolean(errors.password))}
          />
        </Field>

        <label className="flex items-start gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>
            I agree to the{' '}
            <Link to="/terms" target="_blank" className="underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || usernameStatus === 'checking' || !agreedToTerms}
          className="mt-1 rounded-sm bg-ink py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-ink-faint">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-ink underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  )
}

function inputClass(hasError: boolean) {
  return clsx(
    'w-full rounded-sm border bg-card p-2.5 text-base outline-none transition',
    hasError ? 'border-danger' : 'border-line focus:border-line-strong',
  )
}

function Field({
  label,
  error,
  hint,
  onBlur,
  children,
}: {
  label: string
  error?: string
  hint?: string
  onBlur?: () => void
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint" onBlur={onBlur}>
      {label}
      <span className="normal-case tracking-normal">{children}</span>
      {error && <span className="text-xs normal-case tracking-normal text-danger">{error}</span>}
      {!error && hint && <span className="text-xs normal-case tracking-normal text-ink-faint">{hint}</span>}
    </label>
  )
}
