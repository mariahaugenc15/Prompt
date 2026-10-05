import { motion } from 'framer-motion'
import type { ReactionKind } from '../lib/calendarsApi'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, CloseIcon, FlagIcon, PinIcon } from './Icons'
import { AudioProofPlayer } from './AudioProofPlayer'
import { ReactionBar } from './ReactionBar'
import { ReportButton } from './ReportButton'
import { CompletionComments } from './CompletionComments'

// Minimal shape this view needs — a full CompletionView satisfies it
// structurally, and so does the narrower per-challenge completion shape a
// board's submission gallery works with (see BoardDetail.tsx), without
// either caller needing to reshape its data to match the other's.
export interface CompletionDetailData {
  id: string
  category: Category
  text: string
  userCaption?: string
  mediaType?: string
  mediaDataUrl?: string
  senderDisplayName?: string
  completerDisplayName: string
  boardName?: string
  isSelfSent: boolean
  likes: number
  dislikes: number
  laughs: number
  pins: number
  myReaction: ReactionKind | null
  pinnedByMe: boolean
}

// The full-detail view opened by tapping a prompt/submission wherever it
// only shows as a compact preview card (the feed, a board's submission
// gallery) — prompt text, sender, response media, reactions, and the full
// (always-expanded) comment thread, all in one place.
export function CompletionDetailModal({
  completion,
  isMine,
  token,
  onReact,
  onClose,
}: {
  completion: CompletionDetailData
  isMine: boolean
  token?: string
  onReact: (kind: ReactionKind | 'pin') => void
  onClose: () => void
}) {
  const meta = CATEGORY_META[completion.category]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-sm border border-line bg-paper p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
            <CATEGORY_ICON category={completion.category} size={13} />
            {meta.label}
          </span>
          <button onClick={onClose} className="-m-2 p-2 text-ink-faint">
            <CloseIcon size={16} />
          </button>
        </div>

        <p className="font-serif text-lg leading-snug">{completion.text}</p>
        <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
          <FlagIcon size={12} />
          {completion.boardName
            ? `${completion.boardName} → ${completion.completerDisplayName}`
            : completion.isSelfSent
              ? `${completion.completerDisplayName} · anonymous prompt`
              : `${completion.senderDisplayName ?? 'Someone'} → ${completion.completerDisplayName}`}
        </p>

        <div className="mt-3">
          {completion.mediaDataUrl && completion.mediaType === 'photo' && (
            <img src={completion.mediaDataUrl} className="max-h-72 w-full rounded-sm object-cover" alt="proof" />
          )}
          {completion.mediaDataUrl && completion.mediaType === 'video' && (
            <video src={completion.mediaDataUrl} controls playsInline className="max-h-72 w-full rounded-sm bg-ink" />
          )}
          {completion.mediaDataUrl && completion.mediaType === 'audio' && <AudioProofPlayer src={completion.mediaDataUrl} className="mb-0" />}
          {completion.userCaption && <p className="mt-2 text-sm italic text-ink-soft">"{completion.userCaption}"</p>}
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5">
          <ReactionBar
            likes={completion.likes}
            dislikes={completion.dislikes}
            laughs={completion.laughs}
            myReaction={completion.myReaction}
            onReact={onReact}
          />
          <button
            onClick={() => onReact('pin')}
            className={completion.pinnedByMe ? 'flex items-center gap-1 text-xs text-accent' : 'flex items-center gap-1 text-xs text-ink-faint'}
          >
            <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
          </button>
          {!isMine && <ReportButton targetType="completion" targetId={completion.id} token={token} className="ml-auto" />}
        </div>

        <CompletionComments completionId={completion.id} token={token} alwaysExpanded />
      </motion.div>
    </div>
  )
}
