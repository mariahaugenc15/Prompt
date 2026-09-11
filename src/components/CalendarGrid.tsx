import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import type { CompletionView } from '../lib/calendarsApi'
import { CATEGORY_ICON } from './Icons'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildMonthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

function keyFor(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// When a day has more than one completion, the most recent one shows on
// the small calendar cell — simple and always well-defined, no separate
// "pick a cover" step required.
function coverFor(dayCompletions: CompletionView[]): CompletionView | undefined {
  return dayCompletions[0]
}

export function CalendarGrid({
  year,
  month,
  completions,
  onDayClick,
  compact = false,
}: {
  year: number
  month: number
  completions: CompletionView[]
  onDayClick?: (dayKey: string) => void
  compact?: boolean
}) {
  const cells = buildMonthCells(year, month)
  const today = todayKey()
  const byDay = new Map<string, CompletionView[]>()
  for (const c of completions) {
    const list = byDay.get(c.dayKey) ?? []
    list.push(c)
    byDay.set(c.dayKey, list)
  }
  for (const list of byDay.values()) list.sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 text-center text-[10px] uppercase tracking-wider text-ink-faint">
        {WEEKDAYS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const dk = keyFor(date)
          const dayCompletions = byDay.get(dk)
          const cover = dayCompletions && coverFor(dayCompletions)
          const isToday = dk === today
          const coverPhoto = cover?.mediaType === 'photo' ? cover.mediaDataUrl : undefined
          return (
            <button
              key={i}
              onClick={() => onDayClick?.(dk)}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-sm border text-xs transition',
                cover && !coverPhoto && 'border-line bg-card',
                !cover && 'border-line/60 bg-paper-dim/40',
                coverPhoto && 'border-line',
                isToday && 'ring-1 ring-accent ring-offset-1 ring-offset-paper',
                onDayClick && 'hover:border-line-strong',
              )}
            >
              {coverPhoto && <img src={coverPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <span
                className={clsx(
                  'absolute left-1 top-0.5 text-[9px]',
                  coverPhoto ? 'rounded-sm bg-ink/50 px-0.5 text-paper' : isToday ? 'text-accent' : 'text-ink-faint',
                )}
              >
                {date.getDate()}
              </span>
              {!coverPhoto && (
                <AnimatePresence>
                  {cover && (
                    <motion.span
                      key={cover.id}
                      initial={{ scale: 0, rotate: -8, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className="text-ink-soft"
                    >
                      <CATEGORY_ICON category={cover.category} size={compact ? 12 : 14} />
                    </motion.span>
                  )}
                </AnimatePresence>
              )}
              {dayCompletions && dayCompletions.length > 1 && (
                <span
                  className={clsx(
                    'absolute bottom-0.5 right-1 text-[8px]',
                    coverPhoto ? 'rounded-sm bg-ink/50 px-0.5 text-paper' : 'text-ink-faint',
                  )}
                >
                  +{dayCompletions.length - 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
