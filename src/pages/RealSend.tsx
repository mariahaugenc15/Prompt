import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon } from '../components/Icons'
import { sendOneToOnePrompt, searchAccounts, type PublicProfile } from '../lib/realAccountsApi'
import { SentFlyAway } from '../components/SentFlyAway'

export function RealSend() {
  const account = useStore((s) => s.account)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [recipientUsername, setRecipientUsername] = useState(() => searchParams.get('to') ?? '')
  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  // Live suggestions as you type, same debounced search Feed.tsx uses —
  // picking one fills in the exact username so you never have to remember
  // or type someone's handle correctly by hand.
  const [suggestions, setSuggestions] = useState<PublicProfile[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const q = recipientUsername.trim().toLowerCase()

  useEffect(() => {
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      searchAccounts(q, account?.token).then((res) => {
        if (!cancelled) setSuggestions(res.ok ? res.data : [])
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, account?.token])

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to send a prompt this way.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  async function handleSend() {
    setErrors({})
    setSubmitting(true)
    try {
      const res = await sendOneToOnePrompt({ recipientUsername: recipientUsername.trim(), category, text: text.trim() }, account!.token)
      if (!res.ok) {
        setErrors(res.errors)
        return
      }
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to="/profile" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to profile
      </Link>

      <div>
        <h1 className="font-serif text-2xl">Send a prompt</h1>
        <p className="text-xs text-ink-faint">Goes straight to their inbox — enforced the same way on the server.</p>
      </div>

      <label className="relative flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        To (username)
        <input
          value={recipientUsername}
          onChange={(e) => {
            setRecipientUsername(e.target.value)
            setErrors((p) => ({ ...p, recipientUsername: '' }))
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="bob"
          className={clsx(
            'rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.recipientUsername ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.recipientUsername && <span className="text-danger normal-case tracking-normal">{errors.recipientUsername}</span>}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-sm border border-line bg-card shadow-note">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setRecipientUsername(p.username)
                  setShowSuggestions(false)
                  setErrors((prev) => ({ ...prev, recipientUsername: '' }))
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-left normal-case tracking-normal hover:bg-paper-dim"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-xs">
                  {p.displayName.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-medium leading-tight">{p.displayName}</span>
                  <span className="block text-xs text-ink-faint">@{p.username}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Category</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                category === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              <CATEGORY_ICON category={c} size={14} />
              {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Prompt text
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setErrors((p) => ({ ...p, text: '' }))
          }}
          rows={2}
          placeholder="take a picture of a flower and post it"
          className={clsx(
            'resize-none rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.text ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.text && <span className="text-danger normal-case tracking-normal">{errors.text}</span>}
      </label>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <button
        onClick={handleSend}
        disabled={!recipientUsername.trim() || !text.trim() || submitting || sent}
        className="rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {sent ? 'Sent!' : submitting ? 'Sending…' : 'Send prompt'}
      </button>

      {sent && <SentFlyAway onComplete={() => navigate('/')} />}
    </div>
  )
}
