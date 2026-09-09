import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { SubmissionCard } from '../components/SubmissionCard'

export function Feed() {
  const [tab, setTab] = useState<'following' | 'community'>('following')
  const submissions = useStore((s) => s.submissions)
  const following = useStore((s) => s.following)
  const boards = useStore((s) => s.boards)

  const followingIds = new Set([...following, CURRENT_USER_ID])
  const subscribedBoardIds = new Set(boards.filter((b) => b.subscriberIds.includes(CURRENT_USER_ID)).map((b) => b.id))

  const items = useMemo(() => {
    const sorted = [...submissions].sort((a, b) => b.createdAt - a.createdAt)
    if (tab === 'following') return sorted.filter((s) => !s.boardId && followingIds.has(s.userId))
    return sorted.filter((s) => s.boardId && subscribedBoardIds.has(s.boardId))
  }, [submissions, tab, following, boards])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 px-4 pt-3">
        {(['following', 'community'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 rounded-full border py-2 text-sm capitalize transition',
              tab === t ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4">
        {items.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-faint">
            {tab === 'following' ? 'Follow friends to see what they’ve actually done.' : 'Subscribe to a board to see its gallery.'}
          </p>
        ) : (
          <div className="columns-2 gap-3">
            {items.map((sub) => (
              <SubmissionCard key={sub.id} submission={sub} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
