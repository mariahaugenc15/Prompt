import { useState } from 'react'
import { motion } from 'framer-motion'
import type { CompletionView, RealCalendar } from '../lib/calendarsApi'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, CloseIcon, FlagIcon, PinIcon, UpvoteIcon } from './Icons'

export function DayDetailSheet({
  dayKey,
  completions,
  myUsername,
  myCalendars,
  onClose,
  onReact,
  onTag,
}: {
  dayKey: string
  completions: CompletionView[]
  myUsername?: string
  myCalendars: RealCalendar[]
  onClose: () => void
  onReact: (completionId: string, kind: 'upvote' | 'pin') => void
  onTag: (completionId: string, calendarIds: string[]) => void
}) {
  const label = new Date(dayKey + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-lg border-t border-line bg-paper p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">{label}</h2>
          <button onClick={onClose} className="-m-3 p-3 text-ink-faint">
            <CloseIcon size={18} />
          </button>
        </div>

        {completions.length === 0 && <p className="text-sm text-ink-faint">Nothing completed yet.</p>}

        <div className="flex flex-col gap-4">
          {completions.map((c) => (
            <CompletionCard
              key={c.id}
              completion={c}
              isMine={c.completerUsername === myUsername}
              myCalendars={myCalendars}
              onReact={(kind) => onReact(c.id, kind)}
              onTag={(calendarIds) => onTag(c.id, calendarIds)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function CompletionCard({
  completion,
  isMine,
  myCalendars,
  onReact,
  onTag,
}: {
  completion: CompletionView
  isMine: boolean
  myCalendars: RealCalendar[]
  onReact: (kind: 'upvote' | 'pin') => void
  onTag: (calendarIds: string[]) => void
}) {
  const meta = CATEGORY_META[completion.category]
  const [editingTags, setEditingTags] = useState(false)

  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={completion.category} size={13} />
          {meta.label}
        </span>
        {completion.boardName && (
          <span className="text-[10px] uppercase tracking-wide text-ink-faint">{completion.boardName}</span>
        )}
      </div>
      <p className="mt-2 font-serif text-base leading-snug">{completion.text}</p>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
        <FlagIcon size={12} />
        {completion.isSelfSent ? 'Your own board' : `From ${completion.senderDisplayName ?? 'someone'}`}
      </p>

      <div className="mt-3">
        {completion.mediaDataUrl && completion.mediaType === 'photo' && (
          <img src={completion.mediaDataUrl} className="max-h-56 w-full rounded-sm object-cover" alt="proof" />
        )}
        {completion.mediaDataUrl && completion.mediaType === 'video' && (
          <video src={completion.mediaDataUrl} controls playsInline className="max-h-56 w-full rounded-sm bg-ink" />
        )}
        {completion.userCaption && <p className="mt-2 text-sm italic text-ink-soft">"{completion.userCaption}"</p>}
        {completion.calendarNames.length > 0 && (
          <p className="mt-2 text-xs text-ink-faint">Filed in {completion.calendarNames.join(', ')}</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5">
        <button
          onClick={() => onReact('upvote')}
          className={completion.upvotedByMe ? 'flex items-center gap-1 text-xs text-accent' : 'flex items-center gap-1 text-xs text-ink-faint'}
        >
          <UpvoteIcon size={14} /> {completion.upvotes}
        </button>
        <button
          onClick={() => onReact('pin')}
          className={completion.pinnedByMe ? 'flex items-center gap-1 text-xs text-accent' : 'flex items-center gap-1 text-xs text-ink-faint'}
        >
          <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
        </button>
        {isMine && myCalendars.length > 0 && (
          <button onClick={() => setEditingTags((v) => !v)} className="ml-auto text-xs text-ink-faint underline underline-offset-2">
            File into calendars
          </button>
        )}
      </div>

      {editingTags && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {myCalendars.map((cal) => {
            const active = completion.calendarIds.includes(cal.id)
            return (
              <button
                key={cal.id}
                onClick={() =>
                  onTag(active ? completion.calendarIds.filter((id) => id !== cal.id) : [...completion.calendarIds, cal.id])
                }
                className={
                  active
                    ? 'rounded-full border border-ink bg-ink px-2.5 py-1 text-xs text-paper'
                    : 'rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft'
                }
              >
                {cal.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
