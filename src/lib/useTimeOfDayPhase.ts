import { useEffect, useState } from 'react'

export type TimeOfDayPhase = 'morning' | 'midday' | 'night'

// Boundaries, in local hours: morning 5-11, midday 11-17, night 17-5 (wraps).
function phaseAt(date: Date): TimeOfDayPhase {
  const h = date.getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'midday'
  return 'night'
}

function nextBoundary(date: Date): Date {
  const h = date.getHours()
  const boundaryHour = h < 5 ? 5 : h < 11 ? 11 : h < 17 ? 17 : 5
  const next = new Date(date)
  next.setHours(boundaryHour, 0, 5, 0)
  if (next <= date) next.setDate(next.getDate() + 1)
  return next
}

// Same self-rescheduling pattern as useTodayKey — a plain `new Date()` read
// at render time would only ever notice the phase changed if something else
// happened to re-render the page, so this schedules a timer for the next
// 5am/11am/5pm boundary and flips the phase on its own.
export function useTimeOfDayPhase(): TimeOfDayPhase {
  const [phase, setPhase] = useState(() => phaseAt(new Date()))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleNext() {
      const now = new Date()
      const next = nextBoundary(now)
      timeout = setTimeout(() => {
        setPhase(phaseAt(new Date()))
        scheduleNext()
      }, next.getTime() - now.getTime())
    }
    scheduleNext()
    return () => clearTimeout(timeout)
  }, [])

  return phase
}
