import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { IndexCard } from '../components/IndexCard'
import { CalendarIcon, PlusIcon, LockIcon } from '../components/Icons'

export function Calendars() {
  const calendars = useStore((s) => s.calendars)
  const users = useStore((s) => s.users)
  const joinCalendar = useStore((s) => s.joinCalendar)

  const owned = calendars.filter((c) => c.ownerId === CURRENT_USER_ID)
  const joined = calendars.filter((c) => c.ownerId !== CURRENT_USER_ID && c.memberIds.includes(CURRENT_USER_ID))
  const discover = calendars.filter((c) => c.visibility === 'public' && !c.memberIds.includes(CURRENT_USER_ID))

  function ownerName(ownerId: string) {
    return users.find((u) => u.id === ownerId)?.name ?? 'Someone'
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Calendars</h1>
        <Link
          to="/calendars/new"
          className="flex items-center gap-1 rounded-sm border border-ink px-3 py-1.5 text-xs font-medium"
        >
          <PlusIcon size={13} /> New calendar
        </Link>
      </div>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Default</p>
        <IndexCard className="p-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
              <CalendarIcon size={16} />
            </span>
            <div>
              <p className="font-serif text-base leading-tight">All Activity</p>
              <p className="text-xs text-ink-faint">Every completed prompt, always. Your profile's front door.</p>
            </div>
          </Link>
        </IndexCard>
      </section>

      {owned.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your calendars</p>
          <div className="flex flex-col gap-2">
            {owned.map((c) => (
              <CalendarRow key={c.id} id={c.id} name={c.name} visibility={c.visibility} memberCount={c.memberIds.length} owned />
            ))}
          </div>
        </section>
      )}

      {joined.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Joined</p>
          <div className="flex flex-col gap-2">
            {joined.map((c) => (
              <CalendarRow
                key={c.id}
                id={c.id}
                name={c.name}
                visibility={c.visibility}
                memberCount={c.memberIds.length}
                ownerName={ownerName(c.ownerId)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Discover</p>
        <div className="flex flex-col gap-2">
          {discover.map((c) => (
            <CalendarRow
              key={c.id}
              id={c.id}
              name={c.name}
              visibility={c.visibility}
              memberCount={c.memberIds.length}
              ownerName={ownerName(c.ownerId)}
              onJoin={() => joinCalendar(c.id)}
            />
          ))}
          {discover.length === 0 && <p className="text-sm text-ink-faint">No public calendars left to join right now.</p>}
        </div>
      </section>
    </div>
  )
}

function CalendarRow({
  id,
  name,
  visibility,
  memberCount,
  ownerName,
  owned,
  onJoin,
}: {
  id: string
  name: string
  visibility: 'public' | 'private'
  memberCount: number
  ownerName?: string
  owned?: boolean
  onJoin?: () => void
}) {
  return (
    <IndexCard className="p-3">
      <Link to={`/calendars/${id}`} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
          {visibility === 'private' ? <LockIcon size={15} /> : <CalendarIcon size={16} />}
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif text-base leading-tight">{name}</p>
            {!owned && onJoin && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  onJoin()
                }}
                className="shrink-0 rounded-sm border border-ink px-2.5 py-1 text-xs font-medium"
              >
                Join
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">
            {visibility === 'private' ? 'Private' : 'Public'} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
            {ownerName ? ` · started by ${ownerName}` : ''}
          </p>
        </div>
      </Link>
    </IndexCard>
  )
}
