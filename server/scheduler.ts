import { db } from './db.js'

// Shared in-process scheduler for every server-side job the v2 spec asks
// for (Phase 11's monthly recap push, Phase 12's sealed-reveal sweep,
// Phase 13's weekly rollover). There's exactly one web process for this
// app (see render.yaml), so a plain setInterval tick is enough — no
// distributed lock is needed. Idempotency across restarts (a deploy that
// happens to land in the same target minute) is handled by claimJobRun,
// not by the timer itself.

const claimRunStmt = db.prepare(
  `INSERT OR IGNORE INTO job_runs (job_name, period_key, ran_at) VALUES (?, ?, ?)`,
)

// First caller to claim a given (jobName, periodKey) wins; every later
// caller for the same period gets false and should skip. periodKey is
// the job's own notion of "this run" — a date string for a daily job, a
// week id for a weekly one, a prompt id for a one-off reveal.
export function claimJobRun(jobName: string, periodKey: string): boolean {
  const result = claimRunStmt.run(jobName, periodKey, Date.now())
  return result.changes === 1
}

interface DailyJob {
  name: string
  hourUTC: number
  minuteUTC: number
  fn: () => void | Promise<void>
}
interface MinuteJob {
  name: string
  fn: () => void | Promise<void>
}

const dailyJobs: DailyJob[] = []
const minuteJobs: MinuteJob[] = []

// Runs once a day at the given UTC time, at most once per calendar date
// (UTC), using claimJobRun so a restart or a double tick can't fire it
// twice for the same day.
export function registerDailyJob(name: string, hourUTC: number, minuteUTC: number, fn: () => void | Promise<void>) {
  dailyJobs.push({ name, hourUTC, minuteUTC, fn })
}

// Runs on every tick (once a minute) for the process's lifetime. The job
// itself is responsible for its own idempotency (e.g. a `revealed_at IS
// NULL` guard), since "this minute" isn't a meaningful dedupe key.
export function registerMinuteJob(name: string, fn: () => void | Promise<void>) {
  minuteJobs.push({ name, fn })
}

let started = false

export function startScheduler() {
  if (started) return // never double-register the interval, even if called twice by mistake
  started = true
  setInterval(() => {
    const now = new Date()
    for (const job of dailyJobs) {
      if (now.getUTCHours() !== job.hourUTC || now.getUTCMinutes() !== job.minuteUTC) continue
      const periodKey = now.toISOString().slice(0, 10) // YYYY-MM-DD, UTC
      if (!claimJobRun(job.name, periodKey)) continue
      Promise.resolve(job.fn()).catch((err) => console.error(`[scheduler] daily job "${job.name}" failed:`, err))
    }
    for (const job of minuteJobs) {
      Promise.resolve(job.fn()).catch((err) => console.error(`[scheduler] minute job "${job.name}" failed:`, err))
    }
  }, 60 * 1000)
}
