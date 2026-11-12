// Timezone-aware week boundaries for Phase 13's weekly game, computed with
// only the built-in Intl API (no new dependency for something this small).
// "Week" is Monday through Sunday, observed in the board's own configured
// IANA timezone (the spec's "the week boundary uses a timezone set on the
// group") — a board with no explicit setting defaults to UTC.

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The UTC offset (in ms, positive east of UTC) a timezone was at a given
// instant, derived by formatting that instant in the zone and reading back
// what local wall-clock time resulted.
function tzOffsetMs(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  let hour = Number(map.hour)
  if (hour === 24) hour = 0 // some locales render midnight as "24"
  const asIfUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second))
  return asIfUtc - utcMs
}

// Converts a local Y-M-D midnight in `timeZone` to the UTC timestamp it
// actually falls at. Two passes: the first guess ignores DST, the second
// corrects using the offset actually in effect near that guess — exact
// for any ordinary date, and off by at most the DST shift (one hour) on
// the handful of calendar days a transition happens to land on, which
// only ever shifts a week's boundary by an hour, never which day it is.
function localMidnightToUtc(timeZone: string, year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0)
  const offset = tzOffsetMs(timeZone, guess)
  return guess - offset
}

interface LocalDate {
  year: number
  month: number
  day: number
  weekdayIndex: number // 0 = Monday .. 6 = Sunday
}

function localDateAt(timeZone: string, utcMs: number): LocalDate {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const weekdayIndex = WEEKDAY_SHORT.indexOf(map.weekday)
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), weekdayIndex: weekdayIndex < 0 ? 0 : weekdayIndex }
}

// The [start, end) UTC-ms range of the Monday-Sunday week containing `at`
// (default now), as observed in `timezone`.
export function isoWeekRange(timezone: string, at: number = Date.now()): { start: number; end: number } {
  const local = localDateAt(timezone, at)
  // Date.UTC normalizes an out-of-range day (e.g. day 2 minus 5) by
  // rolling the month/year back as needed — used here purely as calendar
  // arithmetic on the Y/M/D numbers themselves, read back with the UTC
  // getters (never re-interpreted through `timezone`, which would shift
  // the date by the zone's offset and silently land on the wrong day).
  const mondayCalendar = new Date(Date.UTC(local.year, local.month - 1, local.day - local.weekdayIndex))
  const start = localMidnightToUtc(timezone, mondayCalendar.getUTCFullYear(), mondayCalendar.getUTCMonth() + 1, mondayCalendar.getUTCDate())
  const end = start + 7 * 24 * 60 * 60 * 1000
  return { start, end }
}

// The local calendar day (as a stable string key) `at` falls on on in
// `timezone` — used for the daily completion cap.
export function localDayKey(timezone: string, at: number): string {
  const d = localDateAt(timezone, at)
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}
