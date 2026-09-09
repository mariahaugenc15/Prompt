import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { BoardCategory } from '../lib/types'

const CATEGORIES: { id: BoardCategory; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'nonprofit', label: 'Nonprofit' },
  { id: 'creator', label: 'Creator' },
  { id: 'local', label: 'Local' },
  { id: 'interest', label: 'Interest' },
]

export function CreateBoard() {
  const navigate = useNavigate()
  const createBoard = useStore((s) => s.createBoard)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<BoardCategory>('interest')
  const [visibility, setVisibility] = useState<'public' | 'invite'>('public')
  const [locationTag, setLocationTag] = useState('')

  function handleCreate() {
    if (!name.trim()) return
    const id = createBoard({
      name: name.trim(),
      description: description.trim(),
      category,
      visibility,
      locationTag: locationTag.trim() || undefined,
    })
    navigate(`/boards/${id}`)
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="font-serif text-2xl">Create a board</h1>

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
              {v === 'invite' ? 'Invite-only' : 'Public'}
            </button>
          ))}
        </div>
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

      <button
        onClick={handleCreate}
        disabled={!name.trim()}
        className="mt-2 rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        Create board
      </button>
    </div>
  )
}
