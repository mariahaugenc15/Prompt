import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon, CloseIcon } from '../components/Icons'
import { sendGroupPrompt, type DeadlineHours } from '../lib/groupPromptsApi'

const DEADLINE_OPTIONS: { hours: DeadlineHours; label: string }[] = [
  { hours: 24, label: '24 hours' },
  { hours: 48, label: '48 hours' },
  { hours: 168, label: '7 days' },
]

const MIN_RECIPIENTS = 2
const MAX_RECIPIENTS = 10

export function GroupSend() {
  const account = useStore((s) => s.account)
  const navigate = useNavigate()

  const [recipients, setRecipients] = useState<string[]>([])
  const [recipientInput, setRecipientInput] = useState('')
  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [sealed, setSealed] = useState(false)
  const [deadlineHours, setDeadlineHours] = useState<DeadlineHours>(48)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function addRecipient() {
    const username = recipientInput.trim().replace(/^@/, '').toLowerCase()
    if (!username) return
    if (recipients.includes(username)) {
      setErrors((p) => ({ ...p, recipientUsernames: 'Already added.' }))
      return
    }
    if (recipients.length >= MAX_RECIPIENTS) {
      setErrors((p) => ({ ...p, recipientUsernames: `A group prompt can have at most ${MAX_RECIPIENTS} recipients.` }))
      return
    }
    setRecipients((p) => [...p, username])
    setRecipientInput('')
    setErrors((p) => ({ ...p, recipientUsernames: '' }))
  }

  function removeRecipient(username: string) {
    setRecipients((p) => p.filter((u) => u !== username))
  }

  async function handleSend() {
    setErrors({})
    if (recipients.length < MIN_RECIPIENTS) {
      setErrors({ recipientUsernames: `Add at least ${MIN_RECIPIENTS} recipients.` })
      return
    }
    setSubmitting(true)
    try {
      const res = await sendGroupPrompt(
        { recipientUsernames: recipients, category, text: text.trim(), sealed, deadlineHours: sealed ? deadlineHours : undefined },
        account!.token,
      )
      if (!res.ok) {
        setErrors(res.errors)
        return
      }
      navigate('/groups')
    } finally {
      setSubmitting(false)
    }
  }

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to send a group prompt.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to="/real/send" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back
      </Link>

      <div>
        <h1 className="font-serif text-2xl">Send to a group</h1>
        <p className="text-xs text-ink-faint">Address 2 to {MAX_RECIPIENTS} people with one prompt, each tracked separately.</p>
      </div>

      <div className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Recipients
        <div className="flex gap-2">
          <input
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addRecipient()
              }
            }}
            placeholder="username"
            className="flex-1 rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
          />
          <button type="button" onClick={addRecipient} className="rounded-sm border border-line px-3 text-sm text-ink-soft">
            Add
          </button>
        </div>
        {errors.recipientUsernames && <span className="text-danger normal-case tracking-normal">{errors.recipientUsernames}</span>}
        {recipients.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {recipients.map((u) => (
              <span key={u} className="flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs normal-case tracking-normal text-ink-soft">
                @{u}
                <button type="button" onClick={() => removeRecipient(u)} className="text-ink-faint">
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

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
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="what should everyone do?"
          className={clsx(
            'resize-none rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.text ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.text && <span className="text-danger normal-case tracking-normal">{errors.text}</span>}
      </label>

      <div className="rounded-sm border border-line bg-card p-3">
        <label className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-medium">Sealed</span>
            <span className="block text-xs text-ink-faint">Everyone's answers stay hidden until the last person finishes.</span>
          </span>
          <input
            type="checkbox"
            checked={sealed}
            onChange={(e) => setSealed(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
        </label>

        {sealed && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">Reveal deadline</p>
            <div className="flex gap-1.5">
              {DEADLINE_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setDeadlineHours(opt.hours)}
                  className={clsx(
                    'rounded-full border px-2.5 py-1 text-xs',
                    deadlineHours === opt.hours ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.deadlineHours && <p className="mt-1 text-xs text-danger">{errors.deadlineHours}</p>}
          </div>
        )}
      </div>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <button
        onClick={handleSend}
        disabled={recipients.length < MIN_RECIPIENTS || !text.trim() || submitting}
        className="rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Sending...' : 'Send group prompt'}
      </button>
    </div>
  )
}
