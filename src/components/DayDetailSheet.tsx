import { motion } from 'framer-motion'
import { useStore, todayKey } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import type { Prompt, UserCalendar } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { isPromptPublic } from '../lib/calendarVisibility'
import { CATEGORY_ICON, CloseIcon, FlagIcon, CheckIcon, GlobeIcon, LockIcon, StarIcon } from './Icons'
import { CompleteChallengeForm } from './CompleteChallengeForm'

export function DayDetailSheet({ dayKey, onClose }: { dayKey: string; onClose: () => void }) {
  const prompts = useStore((s) => s.prompts)
  const users = useStore((s) => s.users)
  const boards = useStore((s) => s.boards)
  const calendars = useStore((s) => s.calendars)
  const completeChallenge = useStore((s) => s.completeChallenge)
  const setDayCover = useStore((s) => s.setDayCover)

  const dayPrompts = prompts.filter((p) => p.dayKey === dayKey && (p.status === 'accepted' || p.status === 'completed'))
  const completedCount = dayPrompts.filter((p) => p.status === 'completed').length
  const label = new Date(dayKey + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const myCalendars = calendars.filter((c) => c.memberIds.includes(CURRENT_USER_ID))

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

        {dayPrompts.length === 0 && <p className="text-sm text-ink-faint">Nothing written in yet.</p>}
        {completedCount > 1 && (
          <p className="mb-3 text-xs text-ink-faint">Multiple prompts today — pick a star to set which photo shows on the calendar.</p>
        )}

        <div className="flex flex-col gap-4">
          {dayPrompts.map((p) => (
            <DayPromptCard
              key={p.id}
              prompt={p}
              calendars={calendars}
              myCalendars={myCalendars}
              showCoverPicker={completedCount > 1}
              onSetCover={() => setDayCover(dayKey, p.id)}
              senderName={
                p.boardId
                  ? boards.find((b) => b.id === p.boardId)?.name
                  : p.anonymous
                    ? undefined
                    : users.find((u) => u.id === p.fromUserId)?.name
              }
              onComplete={(proof, calendarIds) => completeChallenge(p.id, proof, calendarIds)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function DayPromptCard({
  prompt,
  calendars,
  myCalendars,
  showCoverPicker,
  onSetCover,
  senderName,
  onComplete,
}: {
  prompt: Prompt
  calendars: UserCalendar[]
  myCalendars: UserCalendar[]
  showCoverPicker: boolean
  onSetCover: () => void
  senderName?: string
  onComplete: (proof: import('../lib/types').Proof, calendarIds: string[]) => void
}) {
  const meta = CATEGORY_META[prompt.category]
  const isToday = prompt.dayKey === todayKey()
  const isPublic = isPromptPublic(prompt, calendars)

  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={prompt.category} size={13} />
          {meta.label}
        </span>
        {prompt.status === 'completed' && (
          <span className="flex items-center gap-2">
            {showCoverPicker && (
              <button
                onClick={onSetCover}
                title={prompt.isDayCover ? 'Calendar cover for this day' : 'Set as calendar cover for this day'}
                className="-m-2 p-2 text-ink-faint"
              >
                <StarIcon size={15} filled={prompt.isDayCover} className={prompt.isDayCover ? 'text-accent' : ''} />
              </button>
            )}
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
              {isPublic ? <GlobeIcon size={12} /> : <LockIcon size={12} />}
              {isPublic ? 'Public' : 'Private'}
            </span>
            <CheckIcon size={16} className="text-accent" />
          </span>
        )}
      </div>
      <p className="mt-2 font-serif text-base leading-snug">{prompt.text}</p>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
        <FlagIcon size={12} />
        {senderName ? `Assigned by ${senderName}` : prompt.boardId ? 'Board challenge' : 'Assigned anonymously'}
      </p>

      {prompt.status === 'completed' && prompt.proof && (
        <div className="mt-3">
          {prompt.proof.type === 'photo' && prompt.proof.dataUrl && (
            <img src={prompt.proof.dataUrl} className="max-h-56 w-full rounded-sm object-cover" alt="proof" />
          )}
          {prompt.proof.type === 'video' && prompt.proof.dataUrl && (
            <video src={prompt.proof.dataUrl} controls playsInline className="max-h-56 w-full rounded-sm bg-ink" />
          )}
          {prompt.proof.caption && <p className="mt-2 text-sm italic text-ink-soft">"{prompt.proof.caption}"</p>}
          {prompt.calendarIds && prompt.calendarIds.length > 0 && (
            <p className="mt-2 text-xs text-ink-faint">
              Filed in {prompt.calendarIds.map((id) => calendars.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      )}

      {prompt.status === 'accepted' && isToday && (
        <div className="mt-3">
          <CompleteChallengeForm
            onSubmit={onComplete}
            calendarOptions={myCalendars.map((c) => ({ id: c.id, name: c.name, visibility: c.visibility }))}
          />
        </div>
      )}
    </div>
  )
}
