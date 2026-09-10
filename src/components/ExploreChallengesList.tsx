import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, FlagIcon } from './Icons'

// Shared between the standalone /explore page (reached from "Complete a
// prompt" when your backlog is empty) and Feed's Explore tab — one listing,
// so the two entry points can never drift into showing different things
// under the same name.
export function ExploreChallengesList() {
  const navigate = useNavigate()
  const boards = useStore((s) => s.boards)
  const boardChallenges = useStore((s) => s.boardChallenges)
  const users = useStore((s) => s.users)
  const adoptBoardChallenge = useStore((s) => s.adoptBoardChallenge)

  const [adoptedId, setAdoptedId] = useState<string | null>(null)

  function ownerName(ownerId: string) {
    if (ownerId === CURRENT_USER_ID) return 'You'
    return users.find((u) => u.id === ownerId)?.name ?? 'Someone'
  }

  const publicBoardIds = new Set(boards.filter((b) => b.visibility === 'public').map((b) => b.id))
  const listings = boardChallenges
    .filter((c) => publicBoardIds.has(c.boardId))
    .map((c) => ({ challenge: c, board: boards.find((b) => b.id === c.boardId)! }))
    .sort((a, b) => b.challenge.createdAt - a.challenge.createdAt)

  function handleTry(challengeId: string) {
    const id = adoptBoardChallenge(challengeId)
    if (id) setAdoptedId(challengeId)
  }

  if (listings.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-line-strong bg-paper-dim p-4 text-center text-sm text-ink-faint">
        Nothing public to explore yet — be the first to{' '}
        <Link to="/boards/new" className="underline">
          start a board
        </Link>{' '}
        and post a challenge to it.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {listings.map(({ challenge, board }) => (
        <div key={challenge.id} className="rounded-sm border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
              <CATEGORY_ICON category={challenge.category} size={13} />
              {CATEGORY_META[challenge.category].label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">{challenge.cadence}</span>
          </div>
          <p className="mt-2 font-serif text-base leading-snug">{challenge.text}</p>
          <Link to={`/boards/${board.id}`} className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint hover:underline">
            <FlagIcon size={12} />
            {board.name} · by {ownerName(board.ownerId)}
          </Link>

          {adoptedId === challenge.id ? (
            <div className="mt-3 flex items-center justify-between rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
              <span className="text-ink-soft">Added to today.</span>
              <button onClick={() => navigate('/')} className="font-medium text-ink underline underline-offset-2">
                Go to calendar
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleTry(challenge.id)}
              className="mt-3 w-full rounded-sm border border-ink py-2 text-sm font-medium"
            >
              Try it
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
