import { useEffect, useState } from 'react'
import {
  createTeamChallenge,
  getTeamChallenges,
  getTeamChallengeDetail,
  type ChallengeSummary,
  type ChallengeDetail,
} from '../lib/teamChallengeApi'

export function TeamChallenge({ boardId, isOwner, token }: { boardId: string; isOwner: boolean; token?: string }) {
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([])
  const [selected, setSelected] = useState<ChallengeDetail | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [teamCount, setTeamCount] = useState(2)
  const [periodDays, setPeriodDays] = useState(7)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function refreshList() {
    getTeamChallenges(boardId, token).then((res) => res.ok && setChallenges(res.data))
  }

  useEffect(refreshList, [boardId, token])

  function openChallenge(id: string) {
    getTeamChallengeDetail(id, token).then((res) => res.ok && setSelected(res.data))
  }

  async function handleCreate() {
    if (!token) return
    setError('')
    setSubmitting(true)
    try {
      const res = await createTeamChallenge(boardId, { name: name.trim(), teamCount, periodDays }, token)
      if (!res.ok) {
        setError(Object.values(res.errors)[0] ?? 'Something went wrong.')
        return
      }
      setCreating(false)
      setName('')
      refreshList()
      openChallenge(res.data.id)
    } finally {
      setSubmitting(false)
    }
  }

  const active = challenges.filter((c) => c.status === 'active')

  return (
    <section className="rounded-sm border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Team challenge</p>
        {isOwner && !creating && (
          <button onClick={() => setCreating(true)} className="text-xs text-ink-faint underline underline-offset-2">
            + Start one
          </button>
        )}
      </div>

      {isOwner && creating && (
        <div className="mb-3 flex flex-col gap-2 border-b border-line pb-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Challenge name"
            className="rounded-sm border border-line bg-paper p-2 text-sm text-ink outline-none"
          />
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            Teams
            <input
              type="number"
              min={2}
              value={teamCount}
              onChange={(e) => setTeamCount(Math.max(2, Number(e.target.value)))}
              className="w-16 rounded-sm border border-line bg-paper p-1.5 text-sm text-ink"
            />
            Days
            <input
              type="number"
              min={1}
              max={90}
              value={periodDays}
              onChange={(e) => setPeriodDays(Math.max(1, Number(e.target.value)))}
              className="w-16 rounded-sm border border-line bg-paper p-1.5 text-sm text-ink"
            />
          </div>
          <p className="text-[11px] text-ink-faint">Teams are picked randomly from current board members.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className="flex-1 rounded-sm border border-line py-2 text-xs text-ink-soft">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || submitting}
              className="flex-1 rounded-sm bg-ink py-2 text-xs font-medium text-paper disabled:bg-line disabled:text-ink-faint"
            >
              {submitting ? 'Starting...' : 'Start challenge'}
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && !creating && <p className="text-sm italic text-ink-faint">No team challenge running right now.</p>}

      {active.length > 0 && !selected && (
        <div className="flex flex-col gap-1.5">
          {active.map((c) => (
            <button key={c.id} onClick={() => openChallenge(c.id)} className="rounded-sm border border-line px-2.5 py-1.5 text-left text-sm">
              {c.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="font-serif text-base">{selected.name}</p>
            <button onClick={() => setSelected(null)} className="text-xs text-ink-faint underline underline-offset-2">
              Close
            </button>
          </div>
          {selected.status === 'ended' && <p className="text-xs text-accent">Ended</p>}
          {selected.standings.map((team) => (
            <div key={team.teamId} className="flex items-center justify-between rounded-sm border border-line px-2.5 py-1.5 text-sm">
              <span>
                #{team.rank} {team.name} <span className="text-xs text-ink-faint">({team.memberDisplayNames.join(', ')})</span>
              </span>
              <span className="text-xs text-ink-faint">{team.averagePoints.toFixed(1)} avg</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
