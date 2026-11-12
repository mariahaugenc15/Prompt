import { db } from './db.js'
import { registerDailyJob } from './scheduler.js'
import { justEndedMonthKey, getRecap, monthHasEnded } from './recapRepo.js'
import { notifyForEvent } from './notificationsRepo.js'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(monthKey: string): string {
  const [, month] = monthKey.split('-').map(Number)
  return MONTH_NAMES[month - 1]
}

// Individual accounts only — the recap is a personal-completions feature
// ("the friend you exchanged the most prompts with," a personal streak),
// not something an organization board account has a meaningful version of.
const individualAccountIds = db.prepare(`SELECT id FROM accounts WHERE account_type = 'individual' AND is_deleted = 0`)

// Registered once at server boot (see server/index.ts). Fires at 09:00 UTC
// on the 1st of every month — scheduler.ts's claimJobRun keyed on today's
// date means a restart that happens to land in that exact minute on the
// 1st still only sends once.
export function registerMonthlyRecapPushJob(): void {
  registerDailyJob('monthly_recap_push', 9, 0, () => {
    const now = new Date()
    if (now.getUTCDate() !== 1) return
    const monthKey = justEndedMonthKey()
    if (!monthHasEnded(monthKey)) return // defensive; should always be true on the 1st
    const ids = (individualAccountIds.all() as { id: string }[]).map((r) => r.id)
    for (const accountId of ids) {
      const recap = getRecap(accountId, monthKey)
      if (!recap) continue
      const label = monthLabel(monthKey)
      const body = recap.thin
        ? `Your ${label} recap is ready. Every month counts, even a quiet one.`
        : `Your ${label} recap is ready: ${recap.totalCompletions} completions this month.`
      notifyForEvent(accountId, 'monthly_recap', 'Your monthly recap is ready', body, `/recap/${monthKey}`)
    }
  })
}
