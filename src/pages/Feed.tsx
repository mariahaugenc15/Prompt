import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { IndexCard } from '../components/IndexCard'
import { ExploreChallengesList } from '../components/ExploreChallengesList'
import { VerifiedBadge } from '../components/VerifiedBadge'
import { SearchIcon, ShuffleIcon, CloseIcon, PlusIcon, LockIcon, BoardsIcon } from '../components/Icons'
import { listAccounts, searchAccounts, suggestedAccounts, type PublicProfile } from '../lib/realAccountsApi'
import { discoverBoards, getMyBoards, searchBoards, subscribeBoard, type RealBoard } from '../lib/boardsApi'

const BOARD_CATEGORY_LABEL: Record<string, string> = {
  brand: 'Brand',
  nonprofit: 'Nonprofit',
  creator: 'Creator',
  local: 'Local',
  interest: 'Interest',
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const DISCOVER_PAGE_SIZE = 20

// Feed is discovery, not activity — finding people and boards to follow.
// The activity you actually get from what you already follow lives on Home.
export function Feed() {
  const [tab, setTab] = useState<'people' | 'boards' | 'prompts'>('people')
  const [query, setQuery] = useState('')
  const account = useStore((s) => s.account)

  // People tab: real, signed-up accounts, with anyone in your extended
  // network you don't already follow surfaced first.
  const [allProfiles, setAllProfiles] = useState<PublicProfile[]>([])
  const [suggested, setSuggested] = useState<PublicProfile[]>([])

  useEffect(() => {
    listAccounts(account?.token).then((res) => {
      if (res.ok) setAllProfiles(shuffled(res.data))
    })
    if (account) {
      suggestedAccounts(account.token).then((res) => {
        if (res.ok) setSuggested(res.data)
      })
    }
  }, [account])

  function reshuffleProfiles() {
    setAllProfiles((prev) => shuffled(prev))
  }

  const suggestedIds = new Set(suggested.map((p) => p.id))
  const restProfiles = allProfiles.filter((p) => !suggestedIds.has(p.id) && p.id !== account?.id)

  // Boards tab: your own boards plus everything else there is to discover.
  const [myBoards, setMyBoards] = useState<RealBoard[]>([])
  const [discoverBoardsList, setDiscoverBoardsList] = useState<RealBoard[]>([])
  const [discoverHasMore, setDiscoverHasMore] = useState(false)
  const [loadingMoreBoards, setLoadingMoreBoards] = useState(false)

  function refreshBoards() {
    if (!account) return
    getMyBoards(account.token).then((res) => setMyBoards(res.ok ? res.data : []))
    discoverBoards(account.token, 0, DISCOVER_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setDiscoverBoardsList(res.data)
      setDiscoverHasMore(res.data.length === DISCOVER_PAGE_SIZE)
    })
  }

  useEffect(refreshBoards, [account])

  async function handleSubscribeBoard(id: string) {
    if (!account) return
    const res = await subscribeBoard(id, account.token)
    if (res.ok) refreshBoards()
  }

  async function handleLoadMoreBoards() {
    if (!account) return
    setLoadingMoreBoards(true)
    try {
      const res = await discoverBoards(account.token, discoverBoardsList.length, DISCOVER_PAGE_SIZE)
      if (res.ok) {
        setDiscoverBoardsList((prev) => [...prev, ...res.data])
        setDiscoverHasMore(res.data.length === DISCOVER_PAGE_SIZE)
      }
    } finally {
      setLoadingMoreBoards(false)
    }
  }

  const q = query.trim().toLowerCase()
  const searching = q.length >= 2

  const [realMatches, setRealMatches] = useState<PublicProfile[]>([])
  const [realBoardMatches, setRealBoardMatches] = useState<RealBoard[]>([])
  useEffect(() => {
    if (!searching) {
      setRealMatches([])
      setRealBoardMatches([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      searchAccounts(q, account?.token).then((res) => {
        if (!cancelled) setRealMatches(res.ok ? res.data : [])
      })
      searchBoards(q, account?.token).then((res) => {
        if (!cancelled) setRealBoardMatches(res.ok ? res.data : [])
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, searching, account?.token])

  return (
    <div className="flex flex-col gap-3">
      <div className="px-4 pt-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people and boards"
            className="w-full rounded-full border border-line bg-card py-2 pl-9 pr-9 text-base outline-none focus:border-line-strong"
          />
          {query && (
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
            {realMatches.length === 0 ? (
              <p className="text-sm text-ink-faint">No people found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {realMatches.map((p) => (
                  <Link
                    key={p.id}
                    to={`/o/${p.username}`}
                    className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                      {p.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="flex items-center gap-1 text-sm font-medium leading-tight">
                        {p.displayName}
                        {p.isVerified && <VerifiedBadge size={12} />}
                      </p>
                      <p className="text-xs text-ink-faint">@{p.username}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Boards</p>
            {realBoardMatches.length === 0 ? (
              <p className="text-sm text-ink-faint">No boards found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {realBoardMatches.map((b) => (
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
            {(['people', 'boards', 'prompts'] as const).map((t) => (
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
            {tab === 'people' && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-ink-faint">Profiles</p>
                  <button onClick={reshuffleProfiles} className="flex items-center gap-1 text-xs font-medium text-ink">
                    <ShuffleIcon size={13} /> Shuffle
                  </button>
                </div>
                {suggested.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">People you may know</p>
                    <div className="grid grid-cols-2 gap-3">
                      {suggested.map((p) => (
                        <ProfileTile key={p.id} profile={p} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {restProfiles.map((p) => (
                    <ProfileTile key={p.id} profile={p} />
                  ))}
                </div>
              </div>
            )}

            {tab === 'boards' && (
              <div className="flex flex-col gap-6">
                {myBoards.length > 0 && (
                  <section>
                    <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
                    <div className="flex flex-col gap-2">
                      {myBoards.map((b) => (
                        <BoardRow key={b.id} board={b} joined />
                      ))}
                    </div>
                  </section>
                )}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider text-ink-faint">Discover</p>
                    <Link to="/boards/new" className="flex items-center gap-1 text-xs font-medium text-ink">
                      <PlusIcon size={13} /> New board
                    </Link>
                  </div>
                  <div className="flex flex-col gap-2">
                    {discoverBoardsList.map((b) => (
                      <BoardRow key={b.id} board={b} onJoin={() => handleSubscribeBoard(b.id)} />
                    ))}
                    {discoverBoardsList.length === 0 && (
                      <p className="text-sm text-ink-faint">
                        {myBoards.length === 0 ? 'No boards yet — be the first to create one.' : 'You’re subscribed to everything for now.'}
                      </p>
                    )}
                    {discoverHasMore && (
                      <button
                        onClick={handleLoadMoreBoards}
                        disabled={loadingMoreBoards}
                        className="rounded-sm border border-line py-2 text-sm text-ink-soft disabled:opacity-50"
                      >
                        {loadingMoreBoards ? 'Loading…' : 'Load more'}
                      </button>
                    )}
                  </div>
                </section>
              </div>
            )}

            {tab === 'prompts' && <ExploreChallengesList />}
          </div>
        </>
      )}
    </div>
  )
}

function ProfileTile({ profile }: { profile: PublicProfile }) {
  return (
    <Link
      to={`/o/${profile.username}`}
      className="flex flex-col items-center gap-2 rounded-sm border border-line bg-card p-4 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-lg">
        {profile.displayName.charAt(0).toUpperCase()}
      </span>
      <div>
        <p className="flex items-center justify-center gap-1 text-sm font-medium leading-tight">
          {profile.displayName}
          {profile.isVerified && <VerifiedBadge size={12} />}
        </p>
        <p className="text-xs text-ink-faint">@{profile.username}</p>
      </div>
    </Link>
  )
}

function BoardRow({ board, joined, onJoin }: { board: RealBoard; joined?: boolean; onJoin?: () => void }) {
  return (
    <IndexCard className="p-3">
      <Link to={`/boards/${board.id}`} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-base text-ink-soft">
          {board.icon ?? (board.visibility === 'invite' ? <LockIcon size={15} /> : <BoardsIcon size={16} />)}
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif text-base leading-tight">{board.name}</p>
            {!joined && onJoin && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  onJoin()
                }}
                className="shrink-0 rounded-sm border border-ink px-2.5 py-1 text-xs font-medium"
              >
                Subscribe
              </button>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{board.description}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">
            {BOARD_CATEGORY_LABEL[board.category] ?? board.category} · {board.subscriberCount} subscribers
            {board.locationTag ? ` · ${board.locationTag}` : ''}
          </p>
        </div>
      </Link>
    </IndexCard>
  )
}
