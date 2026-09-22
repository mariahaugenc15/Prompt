import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { BoardCategory } from '../lib/types'
import { createBoard } from '../lib/boardsApi'

const CATEGORIES: { id: BoardCategory; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'nonprofit', label: 'Nonprofit' },
  { id: 'creator', label: 'Creator' },
  { id: 'local', label: 'Local' },
  { id: 'interest', label: 'Interest' },
]

const ICON_CHOICES = ['📌', '🏃', '🎨', '🌱', '📚', '🎧', '🍳', '🐾', '⚡', '🏔️', '📷', '☕']

export function CreateBoard() {
  const navigate = useNavigate()
  const account = useStore((s) => s.account)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<BoardCategory>('interest')
  const [visibility, setVisibility] = useState<'public' | 'invite'>('public')
  const [locationTag, setLocationTag] = useState('')
  const [icon, setIcon] = useState(ICON_CHOICES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim() || !account) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await createBoard(
        { name: name.trim(), description: description.trim(), category, visibility, locationTag: locationTag.trim() || undefined, icon },
        account.token,
      )
      if (!res.ok) {
        setError(res.errors.form ?? res.errors.name ?? 'Could not create that board. Please try again.')
        return
      }
      navigate(`/boards/${res.data.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="font-serif text-2xl">Create a board</h1>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Icon</p>
        <div className="flex flex-wrap gap-2">
          {ICON_CHOICES.map((i) => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-sm border text-lg transition',
                icon === i ? 'border-ink bg-ink-soft/10' : 'border-line',
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Board name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pick It Up"
          className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What's this board about?"
          className="resize-none rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
        />
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={clsx(
                'rounded-full border px-3 py-1.5 text-sm transition',
                category === c.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Visibility</p>
        <div className="flex gap-2">
          {(['public', 'invite'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={clsx(
                'flex-1 rounded-sm border py-2 text-sm capitalize transition',
                visibility === v ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              {v === 'invite' ? 'Private group' : 'Public'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {visibility === 'invite'
            ? 'Only people you invite can see or join it, good for something like a book club. It never shows up under Discover.'
            : 'Anyone can find it under Discover and subscribe.'}
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Location tag (optional, for geo-discovery)
        <input
          value={locationTag}
          onChange={(e) => setLocationTag(e.target.value)}
          placeholder="e.g. Portland, OR"
          className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={!name.trim() || submitting}
        className="mt-2 rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Creating…' : 'Create board'}
      </button>
    </div>
  )
}
