import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { CATEGORY_META, type Category } from '../lib/types'
import { PinIcon, CATEGORY_ICON, CloseIcon, CheckIcon } from './Icons'

// A single fridge note, whether it's a mock-layer prompt or a real,
// server-backed one sent to your account — both render through the same
// stack/detail UI so "a prompt was sent to you" always looks and behaves
// the same regardless of which system it came from. Notes stay visible
// here after they're resolved (not just while pending), so there's one
// permanent place to find any prompt again, not a separate inbox that
// empties out once you've acted on something.
export interface FridgeNoteViewModel {
  id: string
  category: Category
  text: string
  // Pinned green when it's something you posted yourself (a board you own),
  // red/accent when it's actually from someone else.
  selfSent: boolean
  stackLabel: string
  detailSourceLabel: string
  status: 'pending' | 'completed' | 'declined'
  onAccept?: () => void // only meaningful (and shown) when status === 'pending'
  completion?: { mediaType: string; mediaDataUrl?: string; autoCaption?: string; userCaption?: string }
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
    <div className="flex gap-3 overflow-x-auto px-4 pt-4 pb-1">
      <AnimatePresence>
        {notes.map((n, idx) => (
          <motion.button
            key={n.id}
            layoutId={`note-${n.id}`}
            initial={{ opacity: 0, y: -12, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: idx % 2 === 0 ? -3 : 2 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={() => onOpen(n.id)}
            className={clsx(
              'relative w-40 shrink-0 rounded-sm border border-line p-3 text-left shadow-note',
              n.status === 'pending' ? 'bg-[#fff9e0]' : 'bg-[#fff9e0]/60',
            )}
          >
            {n.status === 'pending' ? (
              <PinIcon
                size={16}
                className={clsx('absolute -top-2 left-1/2 -translate-x-1/2', n.selfSent ? 'text-success' : 'text-accent')}
              />
            ) : (
              <span className="absolute -top-2 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-paper text-ink-faint">
                {n.status === 'completed' ? <CheckIcon size={9} /> : <CloseIcon size={9} />}
              </span>
            )}
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

        {note.status === 'completed' && note.completion && (
          <div className="mt-3">
            {note.completion.mediaDataUrl && note.completion.mediaType === 'video' ? (
              <video src={note.completion.mediaDataUrl} controls playsInline className="w-full rounded-sm bg-ink" />
            ) : note.completion.mediaDataUrl ? (
              <img src={note.completion.mediaDataUrl} alt="" className="w-full rounded-sm object-cover" />
            ) : null}
            {note.completion.autoCaption && <p className="mt-2 text-xs italic text-ink-faint">{note.completion.autoCaption}</p>}
            {note.completion.userCaption && <p className="mt-1 text-sm text-ink">{note.completion.userCaption}</p>}
          </div>
        )}
        {note.status === 'declined' && <p className="mt-3 text-sm italic text-ink-faint">You declined this one.</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft transition hover:border-line-strong"
          >
            Close
          </button>
          {note.status === 'pending' && note.onAccept && (
            <button
              onClick={note.onAccept}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-ink py-2 text-sm font-medium text-paper"
            >
              <CheckIcon size={14} /> {meta.label}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
