import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import type { BoardChallenge, Category } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, LockIcon } from '../components/Icons'
import { SubmissionCard } from '../components/SubmissionCard'
import { getBoard, inviteToBoard as inviteToRealBoard, subscribeBoard, type RealBoard } from '../lib/boardsApi'

const CADENCES: BoardChallenge['cadence'][] = ['one-off', 'daily', 'weekly']
const CATEGORY_LABEL: Record<string, string> = {
  brand: 'Brand',
  nonprofit: 'Nonprofit',
  creator: 'Creator',
  local: 'Local',
  interest: 'Interest',
}

// A small, real "invite by username" box — the actual way to add a real
// person to a board (mirrored for both the full mock-board view below and
// the simpler real-only fallback), distinct from the mock invite list
// which only ever offers this device's five demo profiles.
function RealInviteBox({ boardId, onInvited }: { boardId: string; onInvited?: () => void }) {
  const account = useStore((s) => s.account)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleInvite() {
    if (!username.trim() || !account) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await inviteToRealBoard(boardId, username.trim(), account.token)
      if (res.ok) {
        setMessage(`Added @${username.trim()}.`)
        setUsername('')
        onInvited?.()
      } else {
        setMessage(res.errors.username ?? res.errors.form ?? 'Could not add that user.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-sm border border-line bg-card p-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Invite a real user by username</p>
      <div className="flex gap-1.5">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="flex-1 rounded-sm border border-line bg-paper p-2 text-base outline-none focus:border-line-strong"
        />
        <button
          onClick={handleInvite}
          disabled={!username.trim() || busy}
          className="shrink-0 rounded-sm border border-ink px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {message && <p className="mt-1.5 text-xs text-ink-faint">{message}</p>}
    </section>
  )
}

export function BoardDetail() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const account = useStore((s) => s.account)
  const board = useStore((s) => s.boards.find((b) => b.id === boardId))
  const allBoardChallenges = useStore((s) => s.boardChallenges)
  const allSubmissions = useStore((s) => s.submissions)
  const users = useStore((s) => s.users)
  const joinBoard = useStore((s) => s.joinBoard)
  const inviteToBoard = useStore((s) => s.inviteToBoard)
  const postBoardChallenge = useStore((s) => s.postBoardChallenge)

  const boardChallenges = useMemo(() => allBoardChallenges.filter((c) => c.boardId === boardId), [allBoardChallenges, boardId])
  const submissions = useMemo(() => allSubmissions.filter((sub) => sub.boardId === boardId), [allSubmissions, boardId])

  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [cadence, setCadence] = useState<BoardChallenge['cadence']>('one-off')

  // Only reached for a board this device doesn't have locally — someone
  // else's real board found via search, Discover, or a shared link.
  const [realBoard, setRealBoard] = useState<RealBoard | null | 'not-found'>(null)
  const [realBusy, setRealBusy] = useState(false)

  function refreshReal() {
    if (!boardId || board) return
    getBoard(boardId, account?.token).then((res) => setRealBoard(res.ok ? res.data : 'not-found'))
  }

  useEffect(refreshReal, [boardId, board, account?.token])

  useEffect(() => {
    if (!board && realBoard === 'not-found') navigate('/boards')
  }, [board, realBoard, navigate])

  if (!board) {
    if (realBoard === null) return null
    if (realBoard === 'not-found') return null

    const rb = realBoard
    const isPrivate = rb.visibility === 'invite'

    async function handleSubscribeReal() {
      if (!account || board) return
      setRealBusy(true)
      try {
        const res = await subscribeBoard(rb.id, account.token)
        if (res.ok) setRealBoard(res.data)
      } finally {
        setRealBusy(false)
      }
    }

    return (
      <div className="flex flex-col gap-5 p-4">
        <div>
          <div className="flex items-center gap-1.5">
            {isPrivate && <LockIcon size={14} className="text-ink-soft" />}
            <h1 className="font-serif text-2xl">{rb.name}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{rb.description}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
            {CATEGORY_LABEL[rb.category] ?? rb.category} · {isPrivate ? 'Private group' : 'Public board'} ·{' '}
            {rb.subscriberCount} {rb.subscriberCount === 1 ? 'member' : 'members'}
            {rb.locationTag ? ` · ${rb.locationTag}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Made by @{rb.ownerUsername}</p>
          {!rb.isOwner && !rb.isSubscribed && !isPrivate && (
            <button
              onClick={handleSubscribeReal}
              disabled={realBusy}
              className="mt-3 rounded-sm border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {realBusy ? 'Subscribing…' : 'Subscribe'}
            </button>
          )}
          {!rb.isOwner && !rb.isSubscribed && isPrivate && (
            <p className="mt-3 text-xs text-ink-faint">This is a private group — ask the owner to invite you.</p>
          )}
          {rb.isSubscribed && !rb.isOwner && <p className="mt-3 text-xs text-success">You're subscribed.</p>}
        </div>

        {rb.isOwner && <RealInviteBox boardId={rb.id} onInvited={refreshReal} />}
      </div>
    )
  }

  const isOwner = board.ownerId === CURRENT_USER_ID
  const isSubscribed = board.subscriberIds.includes(CURRENT_USER_ID)
  const isPrivate = board.visibility === 'invite'
  const invitableUsers = users.filter((u) => !board.subscriberIds.includes(u.id))

  function handlePost() {
    if (!text.trim() || !board) return
    postBoardChallenge(board.id, { text: text.trim(), category, cadence })
    setText('')
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <div className="flex items-center gap-1.5">
          {isPrivate && <LockIcon size={14} className="text-ink-soft" />}
          <h1 className="font-serif text-2xl">{board.name}</h1>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{board.description}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
          {isPrivate ? 'Private group' : 'Public board'} · {board.subscriberIds.length}{' '}
          {board.subscriberIds.length === 1 ? 'member' : 'members'}
          {board.locationTag ? ` · ${board.locationTag}` : ''}
        </p>
        {!isSubscribed && !isPrivate && (
          <button onClick={() => joinBoard(board.id)} className="mt-3 rounded-sm border border-ink px-4 py-2 text-sm font-medium">
            Subscribe
          </button>
        )}
        {!isSubscribed && isPrivate && (
          <p className="mt-3 text-xs text-ink-faint">This is a private group — ask the owner to invite you.</p>
        )}
      </div>

      {isOwner && <RealInviteBox boardId={board.id} />}

      {isOwner && isPrivate && (
        <section className="rounded-sm border border-line bg-card p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Invite one of this device's demo profiles</p>
          {invitableUsers.length === 0 ? (
            <p className="text-sm text-ink-faint">Everyone's already in.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {invitableUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 rounded-sm border border-line bg-paper px-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                    {u.initial}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight">{u.name}</p>
                    <p className="text-xs text-ink-faint">{u.handle}</p>
                  </div>
                  <button
                    onClick={() => inviteToBoard(board.id, u.id)}
                    className="shrink-0 rounded-sm border border-ink px-2.5 py-1 text-xs font-medium"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
              const participation = submissions.filter((s) => s.boardChallengeId === c.id).length
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
