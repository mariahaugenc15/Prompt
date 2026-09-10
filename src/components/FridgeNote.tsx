import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import type { Prompt, User } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CURRENT_USER_ID } from '../lib/seed'
import { PinIcon, CATEGORY_ICON, CloseIcon, CheckIcon } from './Icons'

// A prompt whose fromUserId is you is one you posted yourself (a board you
// own broadcasting to its own subscriber list includes you) — pinned green
// to read as "your own" at a glance, distinct from red for something an
// actual other person sent you.
function isSelfSent(p: Prompt): boolean {
  return p.fromUserId === CURRENT_USER_ID
}

export function FridgeNoteStack({
  prompts,
  sender,
  onOpen,
}: {
  prompts: Prompt[]
  sender: (p: Prompt) => User | undefined
  onOpen: (p: Prompt) => void
}) {
  if (prompts.length === 0) return null
  return (
    <div className="flex flex-wrap gap-3 px-4 pt-4">
      <AnimatePresence>
        {prompts.map((p, idx) => {
          const from = p.anonymous ? undefined : sender(p)
          const selfSent = isSelfSent(p)
          return (
            <motion.button
              key={p.id}
              layoutId={`note-${p.id}`}
              initial={{ opacity: 0, y: -12, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: idx % 2 === 0 ? -3 : 2 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onClick={() => onOpen(p)}
              className="relative w-40 rounded-sm border border-line bg-[#fff9e0] p-3 text-left shadow-note"
            >
              <PinIcon
                size={16}
                className={clsx('absolute -top-2 left-1/2 -translate-x-1/2', selfSent ? 'text-success' : 'text-accent')}
              />
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">
                {p.boardId ? (selfSent ? 'Your board' : 'Board prompt') : from ? from.name : 'Someone sent you a prompt'}
              </p>
              <p className="mt-1 line-clamp-3 font-serif text-sm text-ink">{p.text}</p>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export function FridgeNoteDetail({
  prompt,
  sender,
  tossing,
  onAccept,
  onDecline,
  onClose,
}: {
  prompt: Prompt
  sender?: User
  tossing: boolean
  onAccept: () => void
  onDecline: () => void
  onClose: () => void
}) {
  const meta = CATEGORY_META[prompt.category]
  const selfSent = isSelfSent(prompt)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <motion.div
        layoutId={`note-${prompt.id}`}
        onClick={(e) => e.stopPropagation()}
        animate={tossing ? { x: 260, rotate: 35, opacity: 0 } : { x: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeIn' }}
        className="relative w-full max-w-xs rounded-sm border border-line bg-[#fff9e0] p-5 shadow-note"
      >
        <PinIcon
          size={20}
          className={clsx('absolute -top-3 left-1/2 -translate-x-1/2', selfSent ? 'text-success' : 'text-accent')}
        />
        <button onClick={onClose} className="absolute right-0 top-0 p-3 text-ink-faint">
          <CloseIcon size={16} />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={prompt.category} size={13} />
          {meta.label}
        </p>
        <p className="mb-3 mt-2 text-xs text-ink-soft">
          {prompt.boardId
            ? selfSent
              ? 'From a board you created'
              : 'From a board you follow'
            : prompt.anonymous
              ? 'From someone who wants to stay a secret'
              : `From ${sender?.name ?? 'a friend'}`}
        </p>
        <p className="font-serif text-lg leading-snug text-ink">{prompt.text}</p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onDecline}
            className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft transition hover:border-line-strong"
          >
            Toss it
          </button>
          <button
            onClick={onAccept}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-ink py-2 text-sm font-medium text-paper"
          >
            <CheckIcon size={14} /> Write it in
          </button>
        </div>
      </motion.div>
    </div>
  )
}
