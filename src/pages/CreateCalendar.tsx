import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { CalendarVisibility } from '../lib/types'

export function CreateCalendar() {
  const navigate = useNavigate()
  const createCalendar = useStore((s) => s.createCalendar)

  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<CalendarVisibility>('private')

  function handleCreate() {
    if (!name.trim()) return
    const id = createCalendar(name.trim(), visibility)
    navigate(`/calendars/${id}`)
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="font-serif text-2xl">Create a calendar</h1>
      <p className="-mt-3 text-sm text-ink-soft">
        A named, themed home for prompts you complete — like "Fitness Prompts" or "Sarah &amp; Me." Every completion
        also stays on your All Activity calendar no matter what.
      </p>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Calendar name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fitness Prompts"
          className="rounded-sm border border-line bg-card p-2.5 text-base normal-case tracking-normal outline-none focus:border-line-strong"
        />
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Visibility</p>
        <div className="flex gap-2">
          {(['private', 'public'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={clsx(
                'flex-1 rounded-sm border py-2 text-sm capitalize transition',
                visibility === v ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {visibility === 'private'
            ? 'Only you can see it. Note: a prompt completed as part of a public board challenge stays public regardless — a private calendar can organize it for you, but it can’t hide it.'
            : 'Anyone can find and join it, and see what gets tagged into it.'}
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={!name.trim()}
        className="mt-2 rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        Create calendar
      </button>
    </div>
  )
}
