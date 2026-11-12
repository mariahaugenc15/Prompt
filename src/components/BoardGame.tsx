import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  getGameSettings,
  setGameSettings,
  getLeaderboard,
  getPastWeeks,
  setOptOut,
  type GameSettings,
  type Leaderboard,
  type PastWeek,
} from '../lib/gameApi'

const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export function BoardGame({ boardId, isOwner, myUsername, token }: { boardId: string; isOwner: boolean; myUsername?: string; token?: string }) {
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null)
  const [pastWeeks, setPastWeeks] = useState<PastWeek[]>([])
  const [showAllWeeks, setShowAllWeeks] = useState(false)
  const [showAllRanks, setShowAllRanks] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  function refresh() {
    getGameSettings(boardId, token).then((res) => res.ok && setSettings(res.data))
  }

  useEffect(refresh, [boardId, token])

  useEffect(() => {
    if (!settings?.enabled || settings.disabledByAdmin) return
    getLeaderboard(boardId, token).then((res) => res.ok && setLeaderboard(res.data))
    getPastWeeks(boardId, token).then((res) => res.ok && setPastWeeks(res.data))
  }, [boardId, token, settings?.enabled, settings?.disabledByAdmin])

  async function handleToggleEnabled(enabled: boolean) {
    if (!token) return
    setSavingConfig(true)
    try {
      const res = await setGameSettings(boardId, { enabled, timezone: settings?.timezone ?? 'UTC', hideRanks: settings?.hideRanks ?? false }, token)
      if (res.ok) setSettings(res.data)
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleConfigChange(patch: Partial<{ timezone: string; hideRanks: boolean }>) {
    if (!token || !settings) return
    setSavingConfig(true)
    try {
      const res = await setGameSettings(boardId, { enabled: settings.enabled, timezone: settings.timezone, hideRanks: settings.hideRanks, ...patch }, token)
      if (res.ok) setSettings(res.data)
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleOptOut(optOut: boolean) {
    if (!token) return
    const res = await setOptOut(boardId, optOut, token)
    if (res.ok) {
      const refreshed = await getLeaderboard(boardId, token)
      if (refreshed.ok) setLeaderboard(refreshed.data)
    }
  }

  if (!settings) return null
  if (!isOwner && (!settings.enabled || settings.disabledByAdmin)) return null

  const topThree = leaderboard?.entries.slice(0, 3) ?? []
  const myEntry = leaderboard?.entries.find((e) => e.username === myUsername)
  const myInTopThree = myEntry && topThree.includes(myEntry)

  return (
    <section className="rounded-sm border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Weekly game</p>
        {isOwner && (
          <button onClick={() => setConfigOpen((v) => !v)} className="text-xs text-ink-faint underline underline-offset-2">
            {configOpen ? 'Close' : 'Settings'}
          </button>
        )}
      </div>

      {isOwner && configOpen && (
        <div className="mb-3 flex flex-col gap-3 border-b border-line pb-3">
          <label className="flex items-center justify-between text-sm">
            <span>Turn on weekly game</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={savingConfig}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
          {settings.enabled && (
            <>
              <label className="flex flex-col gap-1 text-xs text-ink-faint">
                Week timezone
                <select
                  value={settings.timezone}
                  onChange={(e) => handleConfigChange({ timezone: e.target.value })}
                  className="rounded-sm border border-line bg-paper p-2 text-sm text-ink"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Hide ranks (participation only)</span>
                <input
                  type="checkbox"
                  checked={settings.hideRanks}
                  disabled={savingConfig}
                  onChange={(e) => handleConfigChange({ hideRanks: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
              </label>
            </>
          )}
        </div>
      )}

      {settings.disabledByAdmin && <p className="text-sm italic text-ink-faint">This board's game has been disabled by moderation.</p>}

      {settings.enabled && !settings.disabledByAdmin && leaderboard && (
        <div className="flex flex-col gap-2">
          {leaderboard.entries.length === 0 ? (
            <p className="text-sm italic text-ink-faint">Nobody's completed anything in this board this week yet.</p>
          ) : (
            <>
              {(showAllRanks ? leaderboard.entries : topThree).map((e) => (
                <div
                  key={e.username}
                  className={clsx(
                    'flex items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                    e.username === myUsername ? 'bg-accent-soft/40' : '',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {e.rank !== undefined && <span className="w-4 text-xs text-ink-faint">#{e.rank}</span>}
                    {e.displayName}
                    {e.username === myUsername && ' (you)'}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {e.points !== undefined ? `${e.points} pts` : `${e.completions} done`}
                  </span>
                </div>
              ))}
              {!myInTopThree && myEntry && !showAllRanks && (
                <div className="flex items-center justify-between rounded-sm bg-accent-soft/40 px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    {myEntry.rank !== undefined && <span className="w-4 text-xs text-ink-faint">#{myEntry.rank}</span>}
                    {myEntry.displayName} (you)
                  </span>
                  <span className="text-xs text-ink-faint">{myEntry.points !== undefined ? `${myEntry.points} pts` : `${myEntry.completions} done`}</span>
                </div>
              )}
              {leaderboard.entries.length > 3 && (
                <button onClick={() => setShowAllRanks((v) => !v)} className="text-center text-xs text-ink-faint underline underline-offset-2">
                  {showAllRanks ? 'Show less' : `See everyone (${leaderboard.entries.length})`}
                </button>
              )}
            </>
          )}

          {myUsername && (
            <button onClick={() => handleOptOut(!leaderboard.myOptedOut)} className="mt-1 self-start text-xs text-ink-faint underline underline-offset-2">
              {leaderboard.myOptedOut ? 'Opt back in to this game' : 'Opt out of this game'}
            </button>
          )}

          {pastWeeks.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <button onClick={() => setShowAllWeeks((v) => !v)} className="text-xs text-ink-faint underline underline-offset-2">
                {showAllWeeks ? 'Hide past weeks' : 'Past weeks'}
              </button>
              {showAllWeeks && (
                <div className="mt-2 flex flex-col gap-1">
                  {pastWeeks.map((w) => (
                    <p key={w.id} className="text-xs text-ink-faint">
                      {new Date(w.weekStart).toLocaleDateString()}: {w.winner ? `${w.winner.displayName} won (${w.winner.points} pts)` : 'no winner'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
