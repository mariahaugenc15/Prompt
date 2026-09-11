import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
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

export function Boards() {
  const account = useStore((s) => s.account)
  const boards = useStore((s) => s.boards)
  const joinBoard = useStore((s) => s.joinBoard)

  const subscribed = boards.filter((b) => b.subscriberIds.includes(CURRENT_USER_ID))
  // Private groups are invite-only by definition — they never show up here
  // to browse or self-join, only in "Your boards" once someone invites you.
  const mockDiscover = boards.filter((b) => !b.subscriberIds.includes(CURRENT_USER_ID) && b.visibility === 'public')

  // Real, server-backed boards — anyone else's public board (or one of your
  // own you joined from another device) shows up here too, not just the
  // ones this device happens to already know about locally.
  const [myRealBoards, setMyRealBoards] = useState<RealBoard[]>([])
  const [discoverBoardsList, setDiscoverBoardsList] = useState<RealBoard[]>([])

  function refresh() {
    if (!account) return
    getMyBoards(account.token).then((res) => setMyRealBoards(res.ok ? res.data : []))
    discoverBoards(account.token).then((res) => setDiscoverBoardsList(res.ok ? res.data : []))
  }

  useEffect(refresh, [account])

  const localIds = new Set(subscribed.map((b) => b.id))
  const realOnlyMine = myRealBoards.filter((b) => !localIds.has(b.id))
  const discoverIds = new Set(mockDiscover.map((b) => b.id))
  const realOnlyDiscover = discoverBoardsList.filter((b) => !discoverIds.has(b.id) && !localIds.has(b.id))

  async function handleSubscribe(id: string) {
    if (!account) return
    const res = await subscribeBoard(id, account.token)
    if (res.ok) refresh()
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

      {(subscribed.length > 0 || realOnlyMine.length > 0) && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
          <div className="flex flex-col gap-2">
            {subscribed.map((b) => (
              <BoardRow
                key={b.id}
                boardId={b.id}
                name={b.name}
                description={b.description}
                category={b.category}
                count={b.subscriberIds.length}
                isPrivate={b.visibility === 'invite'}
                joined
              />
            ))}
            {realOnlyMine.map((b) => (
              <BoardRow
                key={b.id}
                boardId={b.id}
                name={b.name}
                description={b.description}
                category={b.category}
                count={b.subscriberCount}
                locationTag={b.locationTag}
                isPrivate={b.visibility === 'invite'}
                joined
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Discover</p>
        <div className="flex flex-col gap-2">
          {mockDiscover.map((b) => (
            <BoardRow
              key={b.id}
              boardId={b.id}
              name={b.name}
              description={b.description}
              category={b.category}
              count={b.subscriberIds.length}
              locationTag={b.locationTag}
              onJoin={() => joinBoard(b.id)}
            />
          ))}
          {realOnlyDiscover.map((b) => (
            <BoardRow
              key={b.id}
              boardId={b.id}
              name={b.name}
              description={b.description}
              category={b.category}
              count={b.subscriberCount}
              locationTag={b.locationTag}
              onJoin={() => handleSubscribe(b.id)}
            />
          ))}
          {mockDiscover.length === 0 && realOnlyDiscover.length === 0 && (
            <p className="text-sm text-ink-faint">
              {boards.length === 0 && myRealBoards.length === 0 ? 'No boards yet — be the first to create one.' : 'You’re subscribed to everything for now.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function BoardRow({
  boardId,
  name,
  description,
  category,
  count,
  locationTag,
  isPrivate,
  joined,
  onJoin,
}: {
  boardId: string
  name: string
  description: string
  category: string
  count: number
  locationTag?: string
  isPrivate?: boolean
  joined?: boolean
  onJoin?: () => void
}) {
  return (
    <IndexCard className="p-3">
      <Link to={`/boards/${boardId}`} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
          {isPrivate ? <LockIcon size={15} /> : <BoardsIcon size={16} />}
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif text-base leading-tight">{name}</p>
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
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{description}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">
            {CATEGORY_LABEL[category] ?? category} · {count} subscribers{locationTag ? ` · ${locationTag}` : ''}
          </p>
        </div>
      </Link>
    </IndexCard>
  )
}
