import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarGrid } from './CalendarGrid'
import type { CompletionView } from '../lib/calendarsApi'
import { shiftMonth, compareMonthCursor, monthCursorLabel, type MonthCursor } from '../lib/monthCursor'
import { getRecap, type RecapData } from '../lib/recapApi'

const INITIAL_MONTHS = 3
const MONTHS_PER_LOAD = 3

function monthKeyFor(cursor: MonthCursor): string {
  return `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
}

// Replaces a single fixed-month CalendarGrid with a vertically scrolling
// stack of months — newest at the top, older months revealed as you
// scroll (lazily, so a long history doesn't render hundreds of grids up
// front), down to oldestCursor (the account's creation month, so
// "scrolling back reaches all past months" per the brief — this is also
// what fixed the September-disappears-in-October bug at its root, since
// there's no longer a single "current month" the view is pinned to).
export function ScrollableMonthFeed({
  newestCursor,
  oldestCursor,
  completions,
  onDayClick,
  token,
}: {
  newestCursor: MonthCursor
  oldestCursor: MonthCursor | null
  completions: CompletionView[]
  onDayClick: (dayKey: string) => void
  // Optional: when given, the just-ended month's recap card (Phase 11)
  // appears at the top of the feed once it's ready. Omitted entirely for
  // a read-only view of someone else's calendar (OrgPage.tsx never passes
  // this), since a recap is self-only data.
  token?: string
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_MONTHS)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [justEndedRecap, setJustEndedRecap] = useState<RecapData | null>(null)

  const justEndedKey = monthKeyFor(shiftMonth(newestCursor, -1))

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getRecap(justEndedKey, token).then((data) => {
      if (!cancelled) setJustEndedRecap(data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [token, justEndedKey])

  // The month the app considers "now" rolling over (left open across
  // midnight on month-end) always surfaces immediately rather than
  // waiting on a scroll-triggered load.
  useEffect(() => {
    setVisibleCount((c) => Math.max(c, INITIAL_MONTHS))
  }, [newestCursor.year, newestCursor.month])

  const months = useMemo(() => {
    const list: MonthCursor[] = []
    let cursor = newestCursor
    for (let i = 0; i < visibleCount; i++) {
      list.push(cursor)
      if (oldestCursor && compareMonthCursor(cursor, oldestCursor) <= 0) break
      cursor = shiftMonth(cursor, -1)
    }
    return list
  }, [newestCursor, oldestCursor, visibleCount])

  const reachedOldest =
    oldestCursor !== null && months.length > 0 && compareMonthCursor(months[months.length - 1], oldestCursor) <= 0

  useEffect(() => {
    if (reachedOldest) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + MONTHS_PER_LOAD)
      },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [reachedOldest])

  const byMonth = useMemo(() => {
    const map = new Map<string, CompletionView[]>()
    for (const c of completions) {
      const key = c.dayKey.slice(0, 7)
      const list = map.get(key) ?? []
      list.push(c)
      map.set(key, list)
    }
    return map
  }, [completions])

  return (
    <div className="flex flex-col gap-5">
      {justEndedRecap && (
        <Link
          to={`/recap/${justEndedKey}`}
          className="rounded-sm border border-dashed border-accent bg-accent-soft/40 p-3 text-sm"
        >
          <p className="text-[10px] uppercase tracking-wide text-accent">Your recap is ready</p>
          <p className="mt-1 font-serif text-base text-ink">
            {justEndedRecap.thin
              ? `See your ${monthCursorLabel(shiftMonth(newestCursor, -1))} recap`
              : `${justEndedRecap.totalCompletions} completions in ${monthCursorLabel(shiftMonth(newestCursor, -1))}. Tap to see the whole thing.`}
          </p>
        </Link>
      )}
      {months.map((cursor, i) => (
        <div key={monthKeyFor(cursor)}>
          {i === 0 ? (
            <p className="mb-1.5 font-serif text-lg leading-none">
              {monthCursorLabel(cursor)} {cursor.year}
            </p>
          ) : (
            <Link to={`/recap/${monthKeyFor(cursor)}`} className="mb-1.5 flex items-baseline gap-2">
              <span className="font-serif text-lg leading-none">
                {monthCursorLabel(cursor)} {cursor.year}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-ink-faint underline underline-offset-2">Recap</span>
            </Link>
          )}
          <CalendarGrid
            year={cursor.year}
            month={cursor.month}
            completions={byMonth.get(monthKeyFor(cursor)) ?? []}
            onDayClick={onDayClick}
          />
        </div>
      ))}
      {reachedOldest ? (
        <p className="pb-2 text-center text-xs text-ink-faint">That's as far back as it goes.</p>
      ) : (
        <div ref={sentinelRef} className="h-4" />
      )}
    </div>
  )
}
