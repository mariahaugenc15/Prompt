import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { CATEGORY_META, type Category } from '../lib/types'
import { PinIcon, CATEGORY_ICON, NOTE_STICKER_ICON, CloseIcon, CheckIcon } from './Icons'
import {
  NOTE_COLOR_HEX,
  NOTE_HANDWRITING_FONT,
  DEFAULT_NOTE_BG,
  isNoteColor,
  isNoteHandwriting,
  isNoteSticker,
} from '../lib/noteStyle'

// A single fridge note for a real, server-backed prompt sent to your
// account. A completed note stays visible here (it's the record of what
// you made), but a declined one is dropped from the list entirely once
// you decline it — there's nothing to look back on, so it doesn't need a
// permanent place.
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
  onDecline?: () => void // only meaningful (and shown) when status === 'pending' — 1:1 only, broadcasts can't be declined
  completion?: { mediaType: string; mediaDataUrl?: string; autoCaption?: string; userCaption?: string }
  // Phase 9.1 — all undefined on a prompt sent before this feature (or
  // one that never opted into styling), rendering with the exact look
  // every note always had.
  noteColor?: string
  noteSticker?: string
  noteHandwriting?: string
}

function noteBg(color?: string): string {
  return isNoteColor(color) ? NOTE_COLOR_HEX[color] : DEFAULT_NOTE_BG
}

function noteFont(handwriting?: string): string | undefined {
  return isNoteHandwriting(handwriting) ? NOTE_HANDWRITING_FONT[handwriting] : undefined
}

// A small, fixed per-note tilt derived from its own id — a corkboard pin
// never lands two notes at the exact same angle, but it shouldn't jitter
// to a new one on every re-render either.
function tiltFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return (Math.abs(hash) % 9) - 4 // -4..4 degrees
}

const INITIAL_VISIBLE = 6

// The corkboard (Phase 9.2) replacing Home's old single-note/horizontal-
// scroll strip: a loose, responsive grid of every received prompt still
// waiting on you (Home.tsx's `notes` memo already filters to pending-only
// — completed/declined ones belong on the calendar, not here). No expiry
// concept exists yet for an ordinary prompt (that's Phase 12's sealed
// deadline, a different thing), so "soonest-expiring most prominent"
// doesn't apply here; newest-first (the order callers already build this
// list in) is what determines prominence instead.
export function FridgeNoteStack({
  notes,
  onOpen,
}: {
  notes: FridgeNoteViewModel[]
  onOpen: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (notes.length === 0) {
    return (
      <div className="px-4 pt-4">
        <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-sm italic text-ink-faint">
          Nothing pinned up right now. Send someone a prompt and give them something to find.
        </p>
      </div>
    )
  }

  const visible = showAll ? notes : notes.slice(0, INITIAL_VISIBLE)

  return (
    <div className="px-4 pt-4 pb-1">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <AnimatePresence>
          {visible.map((n) => {
            const sticker = isNoteSticker(n.noteSticker) ? n.noteSticker : undefined
            return (
              <motion.button
                key={n.id}
                layoutId={`note-${n.id}`}
                initial={{ opacity: 0, y: -10, scale: 0.9, rotate: 0 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: tiltFor(n.id) }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                onClick={() => onOpen(n.id)}
                style={{ backgroundColor: n.status === 'pending' ? noteBg(n.noteColor) : `${noteBg(n.noteColor)}99` }}
                className="relative rounded-sm border border-line p-3 text-left shadow-note"
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
                {sticker && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
                    <NOTE_STICKER_ICON sticker={sticker} size={12} />
                  </span>
                )}
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{n.stackLabel}</p>
                <p className="mt-1 line-clamp-3 font-serif text-sm text-ink" style={{ fontFamily: noteFont(n.noteHandwriting) }}>
                  {n.text}
                </p>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
      {!showAll && notes.length > INITIAL_VISIBLE && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full text-center text-xs text-ink-faint underline underline-offset-2"
        >
          See all ({notes.length - INITIAL_VISIBLE} more)
        </button>
      )}
    </div>
  )
}

export function FridgeNoteDetail({ note, onClose }: { note: FridgeNoteViewModel; onClose: () => void }) {
  const meta = CATEGORY_META[note.category]
  const sticker = isNoteSticker(note.noteSticker) ? note.noteSticker : undefined
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <motion.div
        layoutId={`note-${note.id}`}
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: noteBg(note.noteColor) }}
        className="relative w-full max-w-xs rounded-sm border border-line p-5 shadow-note"
      >
        <PinIcon
          size={20}
          className={clsx('absolute -top-3 left-1/2 -translate-x-1/2', note.selfSent ? 'text-success' : 'text-accent')}
        />
        {sticker && (
          <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
            <NOTE_STICKER_ICON sticker={sticker} size={16} />
          </span>
        )}
        <button onClick={onClose} className="absolute right-0 top-0 p-3 text-ink-faint">
          <CloseIcon size={16} />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={note.category} size={13} />
          {meta.label}
        </p>
        <p className="mb-3 mt-2 text-xs text-ink-soft">{note.detailSourceLabel}</p>
        <p className="font-serif text-lg leading-snug text-ink" style={{ fontFamily: noteFont(note.noteHandwriting) }}>
          {note.text}
        </p>

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
          {note.status === 'pending' && note.onDecline ? (
            <button
              onClick={note.onDecline}
              className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft transition hover:border-line-strong"
            >
              Decline
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft transition hover:border-line-strong"
            >
              Close
            </button>
          )}
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
