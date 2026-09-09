import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { CalendarGrid } from '../components/CalendarGrid'
import { DayDetailSheet } from '../components/DayDetailSheet'
import { CalendarIcon, LockIcon } from '../components/Icons'

export function CalendarDetail() {
  const { calendarId } = useParams()
  const navigate = useNavigate()
  const calendar = useStore((s) => s.calendars.find((c) => c.id === calendarId))
  const prompts = useStore((s) => s.prompts)
  const users = useStore((s) => s.users)
  const joinCalendar = useStore((s) => s.joinCalendar)
  const leaveCalendar = useStore((s) => s.leaveCalendar)
  const setCalendarVisibility = useStore((s) => s.setCalendarVisibility)

  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    if (!calendar) navigate('/calendars')
  }, [calendar, navigate])

  if (!calendar) return null

  const isOwner = calendar.ownerId === CURRENT_USER_ID
  const isMember = calendar.memberIds.includes(CURRENT_USER_ID)
  const now = new Date()

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
          {calendar.visibility === 'private' ? <LockIcon size={18} /> : <CalendarIcon size={18} />}
        </span>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{calendar.name}</h1>
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            {calendar.visibility === 'private' ? 'Private' : 'Public'} · {calendar.memberIds.length}{' '}
            {calendar.memberIds.length === 1 ? 'member' : 'members'}
          </p>
        </div>
      </div>

      {isOwner ? (
        <div className="flex items-center justify-between rounded-sm border border-line bg-card px-3 py-2.5">
          <span className="text-sm text-ink-soft">Visibility</span>
          <div className="flex gap-1.5">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCalendarVisibility(calendar.id, v)}
                className={clsx(
                  'rounded-sm border px-2.5 py-1 text-xs capitalize transition',
                  calendar.visibility === v ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => (isMember ? leaveCalendar(calendar.id) : joinCalendar(calendar.id))}
          disabled={!isMember && calendar.visibility !== 'public'}
          className={clsx(
            'rounded-sm border px-4 py-2 text-sm font-medium disabled:border-line disabled:text-ink-faint',
            isMember ? 'border-line text-ink-soft' : 'border-ink bg-ink text-paper',
          )}
        >
          {isMember ? 'Leave calendar' : 'Join calendar'}
        </button>
      )}

      <div>
        <p className="mb-2 font-serif text-lg">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <CalendarGrid
          year={now.getFullYear()}
          month={now.getMonth()}
          prompts={prompts}
          calendarId={calendar.id}
          onDayClick={setSelectedDay}
        />
      </div>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Members</p>
        <div className="flex flex-col gap-1.5">
          {calendar.memberIds.map((id) => {
            const name = id === CURRENT_USER_ID ? 'You' : users.find((u) => u.id === id)?.name
            return (
              <div key={id} className="rounded-sm border border-line bg-card px-3 py-2 text-sm">
                {name}
                {id === calendar.ownerId && <span className="ml-1.5 text-xs text-ink-faint">· owner</span>}
              </div>
            )
          })}
        </div>
      </section>

      {selectedDay && <DayDetailSheet dayKey={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}
