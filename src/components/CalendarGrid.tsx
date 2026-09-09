import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import type { Prompt } from '../lib/types'
import { CATEGORY_ICON } from './Icons'
import { todayKey } from '../lib/store'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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

// When a day has more than one completion, the one shown on the small
// calendar cell is whichever is flagged isDayCover (set via the day-detail
// sheet), falling back to the first completed one so a day always has a
// sensible thumbnail without requiring the user to pick.
function coverFor(dayPrompts: Prompt[]): Prompt | undefined {
  const completed = dayPrompts.filter((p) => p.status === 'completed')
  return completed.find((p) => p.isDayCover) ?? completed[0] ?? dayPrompts[0]
}

export function CalendarGrid({
  year,
  month,
  prompts,
  onDayClick,
  compact = false,
  calendarId,
}: {
  year: number
  month: number
  prompts: Prompt[]
  onDayClick?: (dayKey: string) => void
  compact?: boolean
  // Omit for the default "All Activity" view. When set, only completions
  // actually tagged into this calendar show — an in-progress (accepted but
  // not yet completed) prompt has no calendarIds yet, so it's correctly
  // absent from a custom calendar's view until it's tagged at completion.
  calendarId?: string
}) {
  const cells = buildMonthCells(year, month)
  const today = todayKey()
  const byDay = new Map<string, Prompt[]>()
  for (const p of prompts) {
    if ((p.status !== 'completed' && p.status !== 'accepted') || !p.dayKey) continue
    if (calendarId && !p.calendarIds?.includes(calendarId)) continue
    const list = byDay.get(p.dayKey) ?? []
    list.push(p)
    byDay.set(p.dayKey, list)
  }

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
          const dayPrompts = byDay.get(dk)
          const cover = dayPrompts && coverFor(dayPrompts)
          const isToday = dk === today
          const isDraft = cover?.status === 'accepted'
          const coverPhoto = cover?.status === 'completed' && cover.proof?.type === 'photo' ? cover.proof.dataUrl : undefined
          return (
            <button
              key={i}
              onClick={() => onDayClick?.(dk)}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-sm border text-xs transition',
                cover && !isDraft && !coverPhoto && 'border-line bg-card',
                cover && isDraft && 'border-dashed border-line-strong bg-paper-dim',
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
                      key={cover.id + cover.status}
                      initial={{ scale: 0, rotate: -8, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className={isDraft ? 'text-ink-faint' : 'text-ink-soft'}
                    >
                      <CATEGORY_ICON category={cover.category} size={compact ? 12 : 14} />
                    </motion.span>
                  )}
                </AnimatePresence>
              )}
              {dayPrompts && dayPrompts.length > 1 && (
                <span
                  className={clsx(
                    'absolute bottom-0.5 right-1 text-[8px]',
                    coverPhoto ? 'rounded-sm bg-ink/50 px-0.5 text-paper' : 'text-ink-faint',
                  )}
                >
                  +{dayPrompts.length - 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
