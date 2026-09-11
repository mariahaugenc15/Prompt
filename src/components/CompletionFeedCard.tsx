import clsx from 'clsx'
import type { CompletionView } from '../lib/calendarsApi'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, FlagIcon, PinIcon, UpvoteIcon } from './Icons'

// Renders any CompletionView (1:1 completion or board-broadcast completion)
// in the masonry feed grid, with live server-backed reactions.
export function CompletionFeedCard({
  completion,
  onReact,
}: {
  completion: CompletionView
  onReact: (kind: 'upvote' | 'pin') => void
}) {
  const meta = CATEGORY_META[completion.category]
  const caption = completion.userCaption ?? completion.autoCaption ?? completion.text

  return (
    <div className="mb-3 break-inside-avoid rounded-sm border border-line bg-card p-3 shadow-card">
      {completion.mediaDataUrl && completion.mediaType === 'photo' && (
        <img src={completion.mediaDataUrl} alt="" className="mb-2 w-full rounded-sm object-cover" />
      )}
      {completion.mediaDataUrl && completion.mediaType === 'video' && (
        <video src={completion.mediaDataUrl} controls playsInline className="mb-2 w-full rounded-sm bg-ink" />
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

      <div className="mt-2 flex gap-3 border-t border-line pt-2">
        <button
          onClick={() => onReact('upvote')}
          className={clsx('flex items-center gap-1 text-xs', completion.upvotedByMe ? 'text-accent' : 'text-ink-faint')}
        >
          <UpvoteIcon size={14} /> {completion.upvotes}
        </button>
        <button
          onClick={() => onReact('pin')}
          className={clsx('flex items-center gap-1 text-xs', completion.pinnedByMe ? 'text-accent' : 'text-ink-faint')}
        >
          <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </div>
  )
}
