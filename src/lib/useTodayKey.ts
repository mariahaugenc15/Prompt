import { useEffect, useState } from 'react'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

// A plain `new Date()` computed at render time only updates "today" when
// something else happens to trigger a re-render — leave the calendar open
// overnight and it never notices the date changed. This schedules a timer
// for the next local midnight (and keeps rescheduling itself) so the
// highlighted day advances on its own, no app restart required.
export function useTodayKey(): string {
  const [key, setKey] = useState(todayKey)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleNext() {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timeout = setTimeout(() => {
        setKey(todayKey())
        scheduleNext()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleNext()
    return () => clearTimeout(timeout)
  }, [])

  return key
}
