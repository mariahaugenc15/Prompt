import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { IndexCard } from '../components/IndexCard'
import { BoardsIcon, PlusIcon } from '../components/Icons'

const CATEGORY_LABEL: Record<string, string> = {
  brand: 'Brand',
  nonprofit: 'Nonprofit',
  creator: 'Creator',
  local: 'Local',
  interest: 'Interest',
}

export function Boards() {
  const boards = useStore((s) => s.boards)
  const joinBoard = useStore((s) => s.joinBoard)

  const subscribed = boards.filter((b) => b.subscriberIds.includes(CURRENT_USER_ID))
  const discover = boards.filter((b) => !b.subscriberIds.includes(CURRENT_USER_ID))

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

      {subscribed.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
          <div className="flex flex-col gap-2">
            {subscribed.map((b) => (
              <BoardRow key={b.id} boardId={b.id} name={b.name} description={b.description} category={b.category} count={b.subscriberIds.length} joined />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Discover</p>
        <div className="flex flex-col gap-2">
          {discover.map((b) => (
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
          {discover.length === 0 && <p className="text-sm text-ink-faint">You’re subscribed to everything for now.</p>}
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
  joined,
  onJoin,
}: {
  boardId: string
  name: string
  description: string
  category: string
  count: number
  locationTag?: string
  joined?: boolean
  onJoin?: () => void
}) {
  return (
    <IndexCard className="p-3">
      <Link to={`/boards/${boardId}`} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
          <BoardsIcon size={16} />
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
