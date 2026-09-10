import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { CATEGORY_META, type Category } from '../lib/types'
import { PinIcon, CATEGORY_ICON, CloseIcon, CheckIcon } from './Icons'

// A single fridge note, whether it's a mock-layer prompt or a real,
// server-backed one sent to your account — both render through the same
// stack/detail UI so "a prompt was sent to you" always looks and behaves
// the same regardless of which system it came from.
export interface FridgeNoteViewModel {
  id: string
  category: Category
  text: string
  // Pinned green when it's something you posted yourself (a board you own),
  // red/accent when it's actually from someone else — see isSelfSent below.
  selfSent: boolean
  stackLabel: string
  detailSourceLabel: string
  onAccept: () => void
}

export function FridgeNoteStack({
  notes,
  onOpen,
}: {
  notes: FridgeNoteViewModel[]
  onOpen: (id: string) => void
}) {
  if (notes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-3 px-4 pt-4">
      <AnimatePresence>
        {notes.map((n, idx) => (
          <motion.button
            key={n.id}
            layoutId={`note-${n.id}`}
            initial={{ opacity: 0, y: -12, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: idx % 2 === 0 ? -3 : 2 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={() => onOpen(n.id)}
            className="relative w-40 rounded-sm border border-line bg-[#fff9e0] p-3 text-left shadow-note"
          >
            <PinIcon
              size={16}
              className={clsx('absolute -top-2 left-1/2 -translate-x-1/2', n.selfSent ? 'text-success' : 'text-accent')}
            />
            <p className="text-[10px] uppercase tracking-wide text-ink-faint">{n.stackLabel}</p>
            <p className="mt-1 line-clamp-3 font-serif text-sm text-ink">{n.text}</p>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function FridgeNoteDetail({ note, onClose }: { note: FridgeNoteViewModel; onClose: () => void }) {
  const meta = CATEGORY_META[note.category]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <motion.div
        layoutId={`note-${note.id}`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs rounded-sm border border-line bg-[#fff9e0] p-5 shadow-note"
      >
        <PinIcon
          size={20}
          className={clsx('absolute -top-3 left-1/2 -translate-x-1/2', note.selfSent ? 'text-success' : 'text-accent')}
        />
        <button onClick={onClose} className="absolute right-0 top-0 p-3 text-ink-faint">
          <CloseIcon size={16} />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={note.category} size={13} />
          {meta.label}
        </p>
        <p className="mb-3 mt-2 text-xs text-ink-soft">{note.detailSourceLabel}</p>
        <p className="font-serif text-lg leading-snug text-ink">{note.text}</p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft transition hover:border-line-strong"
          >
            Close
          </button>
          <button
            onClick={note.onAccept}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-ink py-2 text-sm font-medium text-paper"
          >
            <CheckIcon size={14} /> {meta.label}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
