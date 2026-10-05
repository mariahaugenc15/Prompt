import clsx from 'clsx'
import { LikeIcon, DislikeIcon, LaughIcon } from './Icons'
import type { ReactionKind } from '../lib/calendarsApi'

// Three mutually-exclusive reactions (one per user per item, changeable or
// removable) replacing the old single upvote — used everywhere a
// CompletionView can render: day detail, the feed, and board submission
// galleries.
export function ReactionBar({
  likes,
  dislikes,
  laughs,
  myReaction,
  onReact,
  className,
}: {
  likes: number
  dislikes: number
  laughs: number
  myReaction: ReactionKind | null
  onReact: (kind: ReactionKind) => void
  className?: string
}) {
  const options = [
    { kind: 'like' as const, Icon: LikeIcon, count: likes },
    { kind: 'dislike' as const, Icon: DislikeIcon, count: dislikes },
    { kind: 'laugh' as const, Icon: LaughIcon, count: laughs },
  ]
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      {options.map(({ kind, Icon, count }) => (
        <button
          key={kind}
          onClick={() => onReact(kind)}
          className={clsx('flex items-center gap-1 text-xs', myReaction === kind ? 'text-accent' : 'text-ink-faint')}
        >
          <Icon size={14} /> {count}
        </button>
      ))}
    </div>
  )
}
