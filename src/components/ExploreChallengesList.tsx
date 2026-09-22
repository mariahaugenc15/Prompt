import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, FlagIcon } from './Icons'
import { discoverChallenges, type DiscoverableChallenge } from '../lib/boardsApi'

// Shared between the standalone /explore page (reached from "Complete a
// prompt" when your backlog is empty) and Feed's Explore tab — one listing,
// so the two entry points can never drift into showing different things
// under the same name. Real, server-backed public board challenges — tap
// through to the board to subscribe and complete it there.
export function ExploreChallengesList() {
  const [challenges, setChallenges] = useState<DiscoverableChallenge[] | null>(null)

  useEffect(() => {
    discoverChallenges().then((res) => setChallenges(res.ok ? res.data : []))
  }, [])

  if (challenges === null) return null

  if (challenges.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-line-strong bg-paper-dim p-4 text-center text-sm text-ink-faint">
        Nothing public to explore yet, be the first to{' '}
        <Link to="/boards/new" className="underline">
          start a board
        </Link>{' '}
        and post a challenge to it.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {challenges.map((challenge) => (
        <Link key={challenge.id} to={`/boards/${challenge.boardId}`} className="block rounded-sm border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
              <CATEGORY_ICON category={challenge.category} size={13} />
              {CATEGORY_META[challenge.category].label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">{challenge.cadence}</span>
          </div>
          <p className="mt-2 font-serif text-base leading-snug">{challenge.text}</p>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
            <FlagIcon size={12} />
            {challenge.boardName} · by {challenge.ownerDisplayName}
          </p>
        </Link>
      ))}
    </div>
  )
}
