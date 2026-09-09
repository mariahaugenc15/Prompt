import clsx from 'clsx'
import type { Submission } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { CATEGORY_ICON, FlagIcon, PinIcon, UpvoteIcon } from './Icons'

export function SubmissionCard({ submission }: { submission: Submission }) {
  const users = useStore((s) => s.users)
  const boards = useStore((s) => s.boards)
  const upvoteSubmission = useStore((s) => s.upvoteSubmission)
  const pinSubmission = useStore((s) => s.pinSubmission)

  const completer = submission.userId === CURRENT_USER_ID ? 'You' : users.find((u) => u.id === submission.userId)?.name
  const assigner = submission.boardId
    ? boards.find((b) => b.id === submission.boardId)?.name
    : submission.anonymous
      ? undefined
      : submission.assignedByUserId
        ? (submission.assignedByUserId === CURRENT_USER_ID ? 'You' : users.find((u) => u.id === submission.assignedByUserId)?.name)
        : undefined

  const hasUpvoted = submission.upvotes.includes(CURRENT_USER_ID)
  const hasPinned = submission.pins.includes(CURRENT_USER_ID)
  const meta = CATEGORY_META[submission.category]

  return (
    <div className="mb-3 break-inside-avoid rounded-sm border border-line bg-card p-3 shadow-card">
      {submission.proof?.dataUrl && submission.proof.type === 'photo' && (
        <img src={submission.proof.dataUrl} alt="" className="mb-2 w-full rounded-sm object-cover" />
      )}
      {submission.proof?.dataUrl && submission.proof.type === 'video' && (
        <video src={submission.proof.dataUrl} controls playsInline className="mb-2 w-full rounded-sm bg-ink" />
      )}
      {!submission.proof?.dataUrl && (
        <div className="mb-2 flex aspect-[4/3] items-center justify-center rounded-sm bg-paper-dim text-ink-faint">
          <CATEGORY_ICON category={submission.category} size={28} />
        </div>
      )}
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
        <CATEGORY_ICON category={submission.category} size={11} />
        {meta.label}
      </p>
      <p className="mt-1 text-sm leading-snug text-ink">{submission.caption ?? submission.text}</p>
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
        <FlagIcon size={11} />
        {assigner ? `${assigner} → ${completer}` : `${completer} · anonymous prompt`}
      </p>

      <div className="mt-2 flex gap-3 border-t border-line pt-2">
        <button
          onClick={() => upvoteSubmission(submission.id)}
          className={clsx('flex items-center gap-1 text-xs', hasUpvoted ? 'text-accent' : 'text-ink-faint')}
        >
          <UpvoteIcon size={14} /> {submission.upvotes.length}
        </button>
        <button
          onClick={() => pinSubmission(submission.id)}
          className={clsx('flex items-center gap-1 text-xs', hasPinned ? 'text-accent' : 'text-ink-faint')}
        >
          <PinIcon size={14} /> {hasPinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </div>
  )
}
