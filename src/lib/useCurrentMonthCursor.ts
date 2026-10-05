import { useEffect, useState } from 'react'
import { currentMonthCursor, type MonthCursor } from './monthCursor'

// Same idea as useTodayKey — a MonthCursor derived from `new Date()` only
// changes when something else triggers a re-render. This reschedules
// itself against the next local midnight so the newest month in a
// scrollable month feed (see ScrollableMonthFeed.tsx) advances on its own
// when the month actually rolls over, no app restart required.
export function useCurrentMonthCursor(): MonthCursor {
  const [cursor, setCursor] = useState<MonthCursor>(currentMonthCursor)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleNext() {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timeout = setTimeout(() => {
        setCursor(currentMonthCursor())
        scheduleNext()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleNext()
    return () => clearTimeout(timeout)
  }, [])

  return cursor
}
