import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { IndexCard } from '../components/IndexCard'
import { BoardsIcon, PlusIcon, LockIcon } from '../components/Icons'
import { discoverBoards, getMyBoards, subscribeBoard, type RealBoard } from '../lib/boardsApi'

const CATEGORY_LABEL: Record<string, string> = {
  brand: 'Brand',
  nonprofit: 'Nonprofit',
  creator: 'Creator',
  local: 'Local',
  interest: 'Interest',
}

const DISCOVER_PAGE_SIZE = 20

export function Boards() {
  const account = useStore((s) => s.account)
  const [mine, setMine] = useState<RealBoard[]>([])
  const [discover, setDiscover] = useState<RealBoard[]>([])
  const [discoverHasMore, setDiscoverHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  function refresh() {
    if (!account) return
    getMyBoards(account.token).then((res) => setMine(res.ok ? res.data : []))
    discoverBoards(account.token, 0, DISCOVER_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setDiscover(res.data)
      setDiscoverHasMore(res.data.length === DISCOVER_PAGE_SIZE)
    })
  }

  useEffect(refresh, [account])

  async function handleSubscribe(id: string) {
    if (!account) return
    const res = await subscribeBoard(id, account.token)
    if (res.ok) refresh()
  }

  async function handleLoadMore() {
    if (!account) return
    setLoadingMore(true)
    try {
      const res = await discoverBoards(account.token, discover.length, DISCOVER_PAGE_SIZE)
      if (res.ok) {
        setDiscover((prev) => [...prev, ...res.data])
        setDiscoverHasMore(res.data.length === DISCOVER_PAGE_SIZE)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Boards</h1>
        <Link
          to="/boards/new"
          className="flex items-center gap-1 rounded-sm border border-ink px-3 py-1.5 text-xs font-medium"
        >
          <PlusIcon size={13} /> New board
        </Link>
      </div>

      {mine.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
          <div className="flex flex-col gap-2">
            {mine.map((b) => (
              <BoardRow key={b.id} board={b} joined />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Discover</p>
        <div className="flex flex-col gap-2">
          {discover.map((b) => (
            <BoardRow key={b.id} board={b} onJoin={() => handleSubscribe(b.id)} />
          ))}
          {discover.length === 0 && (
            <p className="text-sm text-ink-faint">
              {mine.length === 0 ? 'No boards yet — be the first to create one.' : 'You’re subscribed to everything for now.'}
            </p>
          )}
          {discoverHasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-sm border border-line py-2 text-sm text-ink-soft disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </section>
    </div>
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
            {CATEGORY_LABEL[board.category] ?? board.category} · {board.subscriberCount} subscribers
            {board.locationTag ? ` · ${board.locationTag}` : ''}
          </p>
        </div>
      </Link>
    </IndexCard>
  )
}
