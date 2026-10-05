// Small helper so "which month is the calendar showing" can be real
// navigable state instead of always being today's month (see Home.tsx /
// OrgPage.tsx) — the bug this fixes is that a fresh `new Date()` on every
// render can never show any month but the current one, so September
// becomes unreachable the moment it's October.

export interface MonthCursor {
  year: number
  month: number // 0-11
}

export function currentMonthCursor(): MonthCursor {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function monthCursorFromTimestamp(ms: number): MonthCursor {
  const d = new Date(ms)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

// Negative if a comes before b, 0 if equal, positive if after.
export function compareMonthCursor(a: MonthCursor, b: MonthCursor): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

export function monthCursorLabel(cursor: MonthCursor): string {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long' })
}
