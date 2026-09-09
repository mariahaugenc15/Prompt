import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import type { BoardChallenge, Category } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON } from '../components/Icons'
import { SubmissionCard } from '../components/SubmissionCard'

const CADENCES: BoardChallenge['cadence'][] = ['one-off', 'daily', 'weekly']

export function BoardDetail() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const board = useStore((s) => s.boards.find((b) => b.id === boardId))
  const allBoardChallenges = useStore((s) => s.boardChallenges)
  const allSubmissions = useStore((s) => s.submissions)
  const joinBoard = useStore((s) => s.joinBoard)
  const postBoardChallenge = useStore((s) => s.postBoardChallenge)

  const boardChallenges = useMemo(() => allBoardChallenges.filter((c) => c.boardId === boardId), [allBoardChallenges, boardId])
  const submissions = useMemo(() => allSubmissions.filter((sub) => sub.boardId === boardId), [allSubmissions, boardId])

  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [cadence, setCadence] = useState<BoardChallenge['cadence']>('one-off')

  useEffect(() => {
    if (!board) navigate('/boards')
  }, [board, navigate])

  if (!board) return null

  const isOwner = board.ownerId === CURRENT_USER_ID
  const isSubscribed = board.subscriberIds.includes(CURRENT_USER_ID)

  function handlePost() {
    if (!text.trim() || !board) return
    postBoardChallenge(board.id, { text: text.trim(), category, cadence })
    setText('')
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="font-serif text-2xl">{board.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">{board.description}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
          {board.subscriberIds.length} subscribers{board.locationTag ? ` · ${board.locationTag}` : ''}
        </p>
        {!isSubscribed && (
          <button onClick={() => joinBoard(board.id)} className="mt-3 rounded-sm border border-ink px-4 py-2 text-sm font-medium">
            Subscribe
          </button>
        )}
      </div>

      {isOwner && (
        <section className="rounded-sm border border-line bg-card p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Broadcast a challenge</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={clsx(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition',
                  category === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                <CATEGORY_ICON category={c} size={12} />
                {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="What should subscribers do?"
            className="mb-2 w-full resize-none rounded-sm border border-line bg-paper p-2 text-base outline-none focus:border-line-strong"
          />
          <div className="mb-2 flex gap-1.5">
            {CADENCES.map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={clsx(
                  'rounded-sm border px-2.5 py-1 text-xs capitalize transition',
                  cadence === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={handlePost}
            disabled={!text.trim()}
            className="w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
          >
            Send to subscribers
          </button>
        </section>
      )}

      {boardChallenges.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Challenges &amp; participation</p>
          <div className="flex flex-col gap-1.5">
            {boardChallenges.map((c) => {
              const participation = submissions.filter((s) => s.text === c.text).length
              return (
                <div key={c.id} className="flex items-center justify-between rounded-sm border border-line bg-card px-3 py-2 text-sm">
                  <span className="line-clamp-1">{c.text}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{participation} completed</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Submission gallery</p>
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-faint">No submissions yet.</p>
        ) : (
          <div className="columns-2 gap-3">
            {submissions.map((sub) => (
              <SubmissionCard key={sub.id} submission={sub} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
