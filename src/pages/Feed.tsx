import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { SubmissionCard } from '../components/SubmissionCard'
import { SearchIcon, ShuffleIcon, CloseIcon } from '../components/Icons'

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function Feed() {
  const [tab, setTab] = useState<'following' | 'community' | 'explore'>('following')
  const [query, setQuery] = useState('')
  const submissions = useStore((s) => s.submissions)
  const following = useStore((s) => s.following)
  const boards = useStore((s) => s.boards)
  const users = useStore((s) => s.users)

  const followingIds = new Set([...following, CURRENT_USER_ID])
  const subscribedBoardIds = new Set(boards.filter((b) => b.subscriberIds.includes(CURRENT_USER_ID)).map((b) => b.id))

  const items = useMemo(() => {
    const sorted = [...submissions].sort((a, b) => b.createdAt - a.createdAt)
    if (tab === 'following') return sorted.filter((s) => !s.boardId && followingIds.has(s.userId))
    if (tab === 'community') return sorted.filter((s) => s.boardId && subscribedBoardIds.has(s.boardId))
    return []
  }, [submissions, tab, following, boards])

  const [explorePool, setExplorePool] = useState(() => shuffled(users))

  const q = query.trim().toLowerCase()
  const matchingUsers = q ? users.filter((u) => u.id !== CURRENT_USER_ID && (u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q))) : []
  const matchingBoards = q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : []
  const searching = q.length > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="px-4 pt-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people and communities"
            className="w-full rounded-full border border-line bg-card py-2 pl-9 pr-9 text-base outline-none focus:border-line-strong"
          />
          {searching && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-faint">
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {searching ? (
        <div className="flex flex-col gap-4 px-4">
          <section>
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">People</p>
            {matchingUsers.length === 0 ? (
              <p className="text-sm text-ink-faint">No people found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {matchingUsers.map((u) => (
                  <Link key={u.id} to={`/u/${u.id}`} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                      {u.initial}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-tight">{u.name}</p>
                      <p className="text-xs text-ink-faint">{u.handle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Communities</p>
            {matchingBoards.length === 0 ? (
              <p className="text-sm text-ink-faint">No communities found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {matchingBoards.map((b) => (
                  <Link key={b.id} to={`/boards/${b.id}`} className="rounded-sm border border-line bg-card px-3 py-2">
                    <p className="text-sm font-medium leading-tight">{b.name}</p>
                    <p className="line-clamp-1 text-xs text-ink-faint">{b.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="flex gap-2 px-4">
            {(['following', 'community', 'explore'] as const).map((t) => (
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
            {tab === 'explore' ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-ink-faint">Random profiles</p>
                  <button
                    onClick={() => setExplorePool(shuffled(users))}
                    className="flex items-center gap-1 text-xs font-medium text-ink"
                  >
                    <ShuffleIcon size={13} /> Shuffle
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {explorePool
                    .filter((u) => u.id !== CURRENT_USER_ID)
                    .map((u) => (
                      <Link
                        key={u.id}
                        to={`/u/${u.id}`}
                        className="flex flex-col items-center gap-2 rounded-sm border border-line bg-card p-4 text-center"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-lg">
                          {u.initial}
                        </span>
                        <div>
                          <p className="text-sm font-medium leading-tight">{u.name}</p>
                          <p className="text-xs text-ink-faint">{u.handle}</p>
                        </div>
                      </Link>
                    ))}
                </div>
              </div>
            ) : items.length === 0 ? (
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
        </>
      )}
    </div>
  )
}
