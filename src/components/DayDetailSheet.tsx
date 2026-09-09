import { motion } from 'framer-motion'
import { useStore, todayKey } from '../lib/store'
import type { DarePrompt } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, CloseIcon, FlagIcon, CheckIcon } from './Icons'
import { CompleteChallengeForm } from './CompleteChallengeForm'

export function DayDetailSheet({ dayKey, onClose }: { dayKey: string; onClose: () => void }) {
  const prompts = useStore((s) => s.prompts)
  const users = useStore((s) => s.users)
  const boards = useStore((s) => s.boards)
  const completeChallenge = useStore((s) => s.completeChallenge)

  const dayPrompts = prompts.filter((p) => p.dayKey === dayKey && (p.status === 'accepted' || p.status === 'completed'))
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

        {dayPrompts.length === 0 && <p className="text-sm text-ink-faint">Nothing written in yet.</p>}

        <div className="flex flex-col gap-4">
          {dayPrompts.map((p) => (
            <DayPromptCard
              key={p.id}
              prompt={p}
              senderName={
                p.boardId
                  ? boards.find((b) => b.id === p.boardId)?.name
                  : p.anonymous
                    ? undefined
                    : users.find((u) => u.id === p.fromUserId)?.name
              }
              onComplete={(proof) => completeChallenge(p.id, proof)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function DayPromptCard({
  prompt,
  senderName,
  onComplete,
}: {
  prompt: DarePrompt
  senderName?: string
  onComplete: (proof: import('../lib/types').Proof) => void
}) {
  const meta = CATEGORY_META[prompt.category]
  const isToday = prompt.dayKey === todayKey()

  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={prompt.category} size={13} />
          {meta.label}
        </span>
        {prompt.status === 'completed' && <CheckIcon size={16} className="text-accent" />}
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
          {prompt.proof.caption && <p className="mt-2 text-sm italic text-ink-soft">"{prompt.proof.caption}"</p>}
        </div>
      )}

      {prompt.status === 'accepted' && isToday && (
        <div className="mt-3">
          <CompleteChallengeForm onSubmit={onComplete} />
        </div>
      )}
    </div>
  )
}
