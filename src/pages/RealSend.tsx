import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON } from '../components/Icons'
import { sendOneToOnePrompt } from '../lib/realAccountsApi'

export function RealSend() {
  const account = useStore((s) => s.account)
  const navigate = useNavigate()

  const [recipientUsername, setRecipientUsername] = useState('')
  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need a real account to send a real prompt.</p>
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
      setTimeout(() => navigate('/real/inbox'), 900)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="font-serif text-2xl">Send a real prompt</h1>
        <p className="text-xs text-ink-faint">Goes straight to their real inbox — enforced the same way on the server.</p>
      </div>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        To (username)
        <input
          value={recipientUsername}
          onChange={(e) => {
            setRecipientUsername(e.target.value)
            setErrors((p) => ({ ...p, recipientUsername: '' }))
          }}
          placeholder="bob"
          className={clsx(
            'rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.recipientUsername ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.recipientUsername && <span className="text-danger normal-case tracking-normal">{errors.recipientUsername}</span>}
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
        disabled={!recipientUsername.trim() || !text.trim() || submitting}
        className="rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {sent ? 'Sent!' : submitting ? 'Sending…' : 'Send prompt'}
      </button>
    </div>
  )
}
