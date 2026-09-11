import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { IndexCard } from '../components/IndexCard'
import { CalendarIcon, PlusIcon, LockIcon } from '../components/Icons'
import { discoverCalendars, getMyCalendars, joinCalendar, type RealCalendar } from '../lib/calendarsApi'

export function Calendars() {
  const account = useStore((s) => s.account)
  const [mine, setMine] = useState<RealCalendar[]>([])
  const [discover, setDiscover] = useState<RealCalendar[]>([])

  function refresh() {
    if (!account) return
    getMyCalendars(account.token).then((res) => setMine(res.ok ? res.data : []))
    discoverCalendars(account.token).then((res) => setDiscover(res.ok ? res.data : []))
  }

  useEffect(refresh, [account])

  const owned = mine.filter((c) => c.isOwner)
  const joined = mine.filter((c) => !c.isOwner)

  async function handleJoin(id: string) {
    if (!account) return
    const res = await joinCalendar(id, account.token)
    if (res.ok) refresh()
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
              <CalendarRow key={c.id} id={c.id} name={c.name} visibility={c.visibility} memberCount={c.memberCount} owned />
            ))}
          </div>
        </section>
      )}

      {joined.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Joined</p>
          <div className="flex flex-col gap-2">
            {joined.map((c) => (
              <CalendarRow key={c.id} id={c.id} name={c.name} visibility={c.visibility} memberCount={c.memberCount} />
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
              memberCount={c.memberCount}
              onJoin={() => handleJoin(c.id)}
            />
          ))}
          {discover.length === 0 && (
            <p className="text-sm text-ink-faint">
              {mine.length === 0 ? 'No public calendars yet — be the first to create one.' : 'No public calendars left to join right now.'}
            </p>
          )}
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
  owned,
  onJoin,
}: {
  id: string
  name: string
  visibility: 'public' | 'private'
  memberCount: number
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
          </p>
        </div>
      </Link>
    </IndexCard>
  )
}
