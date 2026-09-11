import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CalendarGrid } from '../components/CalendarGrid'
import { DayDetailSheet } from '../components/DayDetailSheet'
import { CalendarIcon, LockIcon } from '../components/Icons'
import {
  getCalendar,
  getCalendarFeed,
  getMyCalendars,
  joinCalendar,
  leaveCalendar,
  reactToCompletion,
  setCalendarVisibility,
  tagCompletion,
  type CompletionView,
  type RealCalendar,
} from '../lib/calendarsApi'

export function CalendarDetail() {
  const { calendarId } = useParams()
  const navigate = useNavigate()
  const account = useStore((s) => s.account)

  const [calendar, setCalendar] = useState<RealCalendar | null | 'not-found'>(null)
  const [feed, setFeed] = useState<CompletionView[]>([])
  const [myCalendars, setMyCalendars] = useState<RealCalendar[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  function refresh() {
    if (!calendarId) return
    getCalendar(calendarId, account?.token).then((res) => setCalendar(res.ok ? res.data : 'not-found'))
    getCalendarFeed(calendarId, account?.token).then((res) => setFeed(res.ok ? res.data : []))
  }

  useEffect(refresh, [calendarId, account?.token])
  useEffect(() => {
    if (account) getMyCalendars(account.token).then((res) => { if (res.ok) setMyCalendars(res.data) })
  }, [account])

  useEffect(() => {
    if (calendar === 'not-found') navigate('/calendars')
  }, [calendar, navigate])

  if (!calendar || calendar === 'not-found') return null

  const cal = calendar
  const now = new Date()

  async function handleJoinLeave() {
    if (!account) return
    const res = cal.isMember ? await leaveCalendar(cal.id, account.token) : await joinCalendar(cal.id, account.token)
    if (res.ok) refresh()
  }

  async function handleVisibility(v: 'public' | 'private') {
    if (!account) return
    const res = await setCalendarVisibility(cal.id, v, account.token)
    if (res.ok) refresh()
  }

  async function handleReact(completionId: string, kind: 'upvote' | 'pin') {
    if (!account) return
    const res = await reactToCompletion(completionId, kind, account.token)
    if (res.ok) setFeed((prev) => prev.map((c) => (c.id === completionId ? { ...c, ...res.data } : c)))
  }

  async function handleTag(completionId: string, calendarIds: string[]) {
    if (!account) return
    const res = await tagCompletion(completionId, calendarIds, account.token)
    if (res.ok) refresh()
  }

  const dayCompletions = selectedDay ? feed.filter((c) => c.dayKey === selectedDay) : []

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-line bg-paper-dim text-ink-soft">
          {cal.visibility === 'private' ? <LockIcon size={18} /> : <CalendarIcon size={18} />}
        </span>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{cal.name}</h1>
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            {cal.visibility === 'private' ? 'Private' : 'Public'} · {cal.memberCount}{' '}
            {cal.memberCount === 1 ? 'member' : 'members'}
          </p>
        </div>
      </div>

      {cal.isOwner ? (
        <div className="flex items-center justify-between rounded-sm border border-line bg-card px-3 py-2.5">
          <span className="text-sm text-ink-soft">Visibility</span>
          <div className="flex gap-1.5">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                onClick={() => handleVisibility(v)}
                className={clsx(
                  'rounded-sm border px-2.5 py-1 text-xs capitalize transition',
                  cal.visibility === v ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={handleJoinLeave}
          disabled={!cal.isMember && cal.visibility !== 'public'}
          className={clsx(
            'rounded-sm border px-4 py-2 text-sm font-medium disabled:border-line disabled:text-ink-faint',
            cal.isMember ? 'border-line text-ink-soft' : 'border-ink bg-ink text-paper',
          )}
        >
          {cal.isMember ? 'Leave calendar' : 'Join calendar'}
        </button>
      )}

      <div>
        <p className="mb-2 font-serif text-lg">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <CalendarGrid year={now.getFullYear()} month={now.getMonth()} completions={feed} onDayClick={setSelectedDay} />
      </div>

      {cal.members && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Members</p>
          <div className="flex flex-col gap-1.5">
            {cal.members.map((m) => (
              <div key={m.id} className="rounded-sm border border-line bg-card px-3 py-2 text-sm">
                {m.displayName}
                {m.id === cal.ownerAccountId && <span className="ml-1.5 text-xs text-ink-faint">· owner</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedDay && (
        <DayDetailSheet
          dayKey={selectedDay}
          completions={dayCompletions}
          myUsername={account?.username}
          token={account?.token}
          myCalendars={myCalendars}
          onClose={() => setSelectedDay(null)}
          onReact={handleReact}
          onTag={handleTag}
        />
      )}
    </div>
  )
}
