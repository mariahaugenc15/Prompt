import { useState } from 'react'
import clsx from 'clsx'
import type { CompletionView, ReactionKind } from '../lib/calendarsApi'
import { CATEGORY_META } from '../lib/types'
import { ReportButton } from './ReportButton'
import { CATEGORY_ICON, FlagIcon, PinIcon } from './Icons'
import { AudioProofPlayer } from './AudioProofPlayer'
import { ReactionBar } from './ReactionBar'
import { CompletionDetailModal } from './CompletionDetailModal'

// Renders any CompletionView (1:1 completion or board-broadcast completion)
// in the masonry feed grid, with live server-backed reactions. Tapping the
// card (anywhere but the reaction/pin/report controls) opens the full
// detail view — prompt, sender, media, reactions, and the full comment
// thread.
export function CompletionFeedCard({
  completion,
  isMine,
  token,
  onReact,
}: {
  completion: CompletionView
  isMine?: boolean
  token?: string
  onReact: (kind: ReactionKind | 'pin') => void
}) {
  const meta = CATEGORY_META[completion.category]
  const caption = completion.userCaption ?? completion.autoCaption ?? completion.text
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        className="mb-3 break-inside-avoid cursor-pointer rounded-sm border border-line bg-card p-3 shadow-card"
      >
        {completion.mediaDataUrl && completion.mediaType === 'photo' && (
          <img src={completion.mediaDataUrl} alt="" className="mb-2 w-full rounded-sm object-cover" />
        )}
        {completion.mediaDataUrl && completion.mediaType === 'video' && (
          <video src={completion.mediaDataUrl} controls playsInline onClick={(e) => e.stopPropagation()} className="mb-2 w-full rounded-sm bg-ink" />
        )}
        {completion.mediaDataUrl && completion.mediaType === 'audio' && (
          <div onClick={(e) => e.stopPropagation()}>
            <AudioProofPlayer src={completion.mediaDataUrl} />
          </div>
        )}
        {!completion.mediaDataUrl && (
          <div className="mb-2 flex aspect-[4/3] items-center justify-center rounded-sm bg-paper-dim text-ink-faint">
            <CATEGORY_ICON category={completion.category} size={28} />
          </div>
        )}
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={completion.category} size={11} />
          {meta.label}
        </p>
        <p className="mt-1 text-sm leading-snug text-ink">{caption}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
          <FlagIcon size={11} />
          {completion.boardName
            ? `${completion.boardName} → ${completion.completerDisplayName}`
            : completion.isSelfSent
              ? `${completion.completerDisplayName} · anonymous prompt`
              : `${completion.senderDisplayName ?? 'Someone'} → ${completion.completerDisplayName}`}
        </p>

        <div className="mt-2 flex items-center gap-3 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
          <ReactionBar
            likes={completion.likes}
            dislikes={completion.dislikes}
            laughs={completion.laughs}
            myReaction={completion.myReaction}
            onReact={onReact}
          />
          <button
            onClick={() => onReact('pin')}
            className={clsx('flex items-center gap-1 text-xs', completion.pinnedByMe ? 'text-accent' : 'text-ink-faint')}
          >
            <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
          </button>
          <ReportButton targetType="completion" targetId={completion.id} token={token} className="ml-auto" />
        </div>
      </div>

      {expanded && (
        <CompletionDetailModal
          completion={completion}
          isMine={Boolean(isMine)}
          token={token}
          onReact={onReact}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}
