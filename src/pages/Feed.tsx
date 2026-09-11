import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CompletionFeedCard } from '../components/CompletionFeedCard'
import { ExploreChallengesList } from '../components/ExploreChallengesList'
import { SearchIcon, ShuffleIcon, CloseIcon } from '../components/Icons'
import { listAccounts, searchAccounts, suggestedAccounts, type PublicProfile } from '../lib/realAccountsApi'
import { searchBoards, type RealBoard } from '../lib/boardsApi'
import { getFollowingFeed, getCommunityFeed } from '../lib/feedApi'
import { reactToCompletion, type CompletionView } from '../lib/calendarsApi'

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const FEED_PAGE_SIZE = 20

export function Feed() {
  const [tab, setTab] = useState<'following' | 'community' | 'explore'>('following')
  const [query, setQuery] = useState('')
  const account = useStore((s) => s.account)

  const [following, setFollowing] = useState<CompletionView[]>([])
  const [community, setCommunity] = useState<CompletionView[]>([])
  const [followingHasMore, setFollowingHasMore] = useState(false)
  const [communityHasMore, setCommunityHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!account) return
    getFollowingFeed(account.token, 0, FEED_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setFollowing(res.data)
      setFollowingHasMore(res.data.length === FEED_PAGE_SIZE)
    })
    getCommunityFeed(account.token, 0, FEED_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setCommunity(res.data)
      setCommunityHasMore(res.data.length === FEED_PAGE_SIZE)
    })
  }, [account])

  async function handleReact(list: 'following' | 'community', completionId: string, kind: 'upvote' | 'pin') {
    if (!account) return
    const res = await reactToCompletion(completionId, kind, account.token)
    if (!res.ok) return
    const patch = (items: CompletionView[]) => items.map((c) => (c.id === completionId ? { ...c, ...res.data } : c))
    if (list === 'following') setFollowing(patch)
    else setCommunity(patch)
  }

  async function handleLoadMore(list: 'following' | 'community') {
    if (!account) return
    setLoadingMore(true)
    try {
      if (list === 'following') {
        const res = await getFollowingFeed(account.token, following.length, FEED_PAGE_SIZE)
        if (res.ok) {
          setFollowing((prev) => [...prev, ...res.data])
          setFollowingHasMore(res.data.length === FEED_PAGE_SIZE)
        }
      } else {
        const res = await getCommunityFeed(account.token, community.length, FEED_PAGE_SIZE)
        if (res.ok) {
          setCommunity((prev) => [...prev, ...res.data])
          setCommunityHasMore(res.data.length === FEED_PAGE_SIZE)
        }
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // Explore's profile grid: real, signed-up accounts, with anyone in your
  // extended network you don't already follow surfaced first.
  const [allProfiles, setAllProfiles] = useState<PublicProfile[]>([])
  const [suggested, setSuggested] = useState<PublicProfile[]>([])
  const [exploreMode, setExploreMode] = useState<'profiles' | 'prompts'>('profiles')

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
            placeholder="Search people and communities"
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
                      <p className="text-sm font-medium leading-tight">{p.displayName}</p>
                      <p className="text-xs text-ink-faint">@{p.username}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Communities</p>
            {realBoardMatches.length === 0 ? (
              <p className="text-sm text-ink-faint">No communities found.</p>
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
                <div className="mb-3 flex gap-2">
                  {(['profiles', 'prompts'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setExploreMode(m)}
                      className={clsx(
                        'flex-1 rounded-full border py-1.5 text-xs capitalize transition',
                        exploreMode === m ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {exploreMode === 'profiles' ? (
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
                ) : (
                  <ExploreChallengesList />
                )}
              </div>
            ) : (tab === 'following' ? following : community).length === 0 ? (
              <p className="mt-8 text-center text-sm text-ink-faint">
                {tab === 'following' ? 'Follow friends to see what they’ve actually done.' : 'Subscribe to a board to see its gallery.'}
              </p>
            ) : (
              <>
                <div className="columns-2 gap-3">
                  {(tab === 'following' ? following : community).map((c) => (
                    <CompletionFeedCard key={c.id} completion={c} token={account?.token} onReact={(kind) => handleReact(tab, c.id, kind)} />
                  ))}
                </div>
                {(tab === 'following' ? followingHasMore : communityHasMore) && (
                  <button
                    onClick={() => handleLoadMore(tab)}
                    disabled={loadingMore}
                    className="mt-1 w-full rounded-sm border border-line py-2 text-sm text-ink-soft disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
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
        <p className="text-sm font-medium leading-tight">{profile.displayName}</p>
        <p className="text-xs text-ink-faint">@{profile.username}</p>
      </div>
    </Link>
  )
}
