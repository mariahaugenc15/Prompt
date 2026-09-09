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

export function CalendarGrid({
  year,
  month,
  prompts,
  onDayClick,
  compact = false,
}: {
  year: number
  month: number
  prompts: Prompt[]
  onDayClick?: (dayKey: string) => void
  compact?: boolean
}) {
  const cells = buildMonthCells(year, month)
  const today = todayKey()
  const byDay = new Map<string, Prompt[]>()
  for (const p of prompts) {
    if ((p.status !== 'completed' && p.status !== 'accepted') || !p.dayKey) continue
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
          const first = dayPrompts?.[0]
          const isToday = dk === today
          const isDraft = first?.status === 'accepted'
          return (
            <button
              key={i}
              onClick={() => onDayClick?.(dk)}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-center rounded-sm border text-xs transition',
                first && !isDraft && 'border-line bg-card',
                first && isDraft && 'border-dashed border-line-strong bg-paper-dim',
                !first && 'border-line/60 bg-paper-dim/40',
                isToday && 'ring-1 ring-accent ring-offset-1 ring-offset-paper',
                onDayClick && 'hover:border-line-strong',
              )}
            >
              <span className={clsx('absolute left-1 top-0.5 text-[9px]', isToday ? 'text-accent' : 'text-ink-faint')}>
                {date.getDate()}
              </span>
              <AnimatePresence>
                {first && (
                  <motion.span
                    key={first.id + first.status}
                    initial={{ scale: 0, rotate: -8, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className={isDraft ? 'text-ink-faint' : 'text-ink-soft'}
                  >
                    <CATEGORY_ICON category={first.category} size={compact ? 12 : 14} />
                  </motion.span>
                )}
              </AnimatePresence>
              {dayPrompts && dayPrompts.length > 1 && (
                <span className="absolute bottom-0.5 right-1 text-[8px] text-ink-faint">+{dayPrompts.length - 1}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
