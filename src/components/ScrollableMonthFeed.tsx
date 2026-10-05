import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarGrid } from './CalendarGrid'
import type { CompletionView } from '../lib/calendarsApi'
import { shiftMonth, compareMonthCursor, monthCursorLabel, type MonthCursor } from '../lib/monthCursor'

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
}: {
  newestCursor: MonthCursor
  oldestCursor: MonthCursor | null
  completions: CompletionView[]
  onDayClick: (dayKey: string) => void
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_MONTHS)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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
      {months.map((cursor) => (
        <div key={monthKeyFor(cursor)}>
          <p className="mb-1.5 font-serif text-lg leading-none">
            {monthCursorLabel(cursor)} {cursor.year}
          </p>
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
