import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { Category } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, LockIcon, PinIcon, UpvoteIcon } from '../components/Icons'
import { reactToCompletion } from '../lib/calendarsApi'
import {
  getBoard,
  getBoardChallenges,
  inviteToBoard,
  postBoardChallenge,
  subscribeBoard,
  type BoardChallenge,
  type RealBoard,
} from '../lib/boardsApi'

const CADENCES: BoardChallenge['cadence'][] = ['one-off', 'daily', 'weekly']
const CATEGORY_LABEL: Record<string, string> = {
  brand: 'Brand',
  nonprofit: 'Nonprofit',
  creator: 'Creator',
  local: 'Local',
  interest: 'Interest',
}

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
      const res = await inviteToBoard(boardId, username.trim(), account.token)
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
      <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Invite by username</p>
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

  const [board, setBoard] = useState<RealBoard | null | 'not-found'>(null)
  const [challenges, setChallenges] = useState<BoardChallenge[]>([])
  const [busy, setBusy] = useState(false)

  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [cadence, setCadence] = useState<BoardChallenge['cadence']>('one-off')
  const [posting, setPosting] = useState(false)

  function refresh() {
    if (!boardId) return
    getBoard(boardId, account?.token).then((res) => setBoard(res.ok ? res.data : 'not-found'))
    getBoardChallenges(boardId, account?.token).then((res) => setChallenges(res.ok ? res.data : []))
  }

  useEffect(refresh, [boardId, account?.token])

  useEffect(() => {
    if (board === 'not-found') navigate('/boards')
  }, [board, navigate])

  if (!board || board === 'not-found') return null

  async function handleSubscribe() {
    if (!account || board === 'not-found' || !board) return
    setBusy(true)
    try {
      const res = await subscribeBoard(board.id, account.token)
      if (res.ok) setBoard(res.data)
    } finally {
      setBusy(false)
    }
  }

  async function handlePost() {
    if (!text.trim() || !account || board === 'not-found' || !board) return
    setPosting(true)
    try {
      const res = await postBoardChallenge(board.id, { category, text: text.trim(), cadence }, account.token)
      if (res.ok) {
        setText('')
        refresh()
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleReact(completionId: string, kind: 'upvote' | 'pin') {
    if (!account) return
    const res = await reactToCompletion(completionId, kind, account.token)
    if (!res.ok) return
    setChallenges((prev) =>
      prev.map((c) => ({
        ...c,
        completions: c.completions.map((comp) => (comp.id === completionId ? { ...comp, ...res.data } : comp)),
      })),
    )
  }

  const isPrivate = board.visibility === 'invite'

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <div className="flex items-center gap-2">
          {board.icon && <span className="text-2xl leading-none">{board.icon}</span>}
          <div className="flex items-center gap-1.5">
            {isPrivate && <LockIcon size={14} className="text-ink-soft" />}
            <h1 className="font-serif text-2xl">{board.name}</h1>
          </div>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{board.description}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
          {CATEGORY_LABEL[board.category] ?? board.category} · {isPrivate ? 'Private group' : 'Public board'} ·{' '}
          {board.subscriberCount} {board.subscriberCount === 1 ? 'member' : 'members'}
          {board.locationTag ? ` · ${board.locationTag}` : ''}
        </p>
        <p className="mt-1 text-xs text-ink-faint">Made by @{board.ownerUsername}</p>
        {!board.isOwner && !board.isSubscribed && !isPrivate && (
          <button
            onClick={handleSubscribe}
            disabled={busy}
            className="mt-3 rounded-sm border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Subscribing…' : 'Subscribe'}
          </button>
        )}
        {!board.isOwner && !board.isSubscribed && isPrivate && (
          <p className="mt-3 text-xs text-ink-faint">This is a private group — ask the owner to invite you.</p>
        )}
        {board.isSubscribed && !board.isOwner && <p className="mt-3 text-xs text-success">You're subscribed.</p>}
      </div>

      {board.isOwner && <RealInviteBox boardId={board.id} onInvited={refresh} />}

      {board.isOwner && (
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
            disabled={!text.trim() || posting}
            className="w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
          >
            {posting ? 'Sending…' : 'Send to subscribers'}
          </button>
        </section>
      )}

      {challenges.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Challenges &amp; participation</p>
          <div className="flex flex-col gap-1.5">
            {challenges.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-sm border border-line bg-card px-3 py-2 text-sm">
                <span className="line-clamp-1">{c.text}</span>
                <span className="shrink-0 text-xs text-ink-faint">{c.participationCount} completed</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Submission gallery</p>
        {challenges.every((c) => c.completions.length === 0) ? (
          <p className="text-sm text-ink-faint">No submissions yet.</p>
        ) : (
          <div className="columns-2 gap-3">
            {challenges.flatMap((challenge) =>
              challenge.completions.map((completion) => (
                <ChallengeCompletionCard
                  key={completion.id}
                  category={challenge.category}
                  challengeText={challenge.text}
                  completion={completion}
                  onReact={(kind) => handleReact(completion.id, kind)}
                />
              )),
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function ChallengeCompletionCard({
  category,
  challengeText,
  completion,
  onReact,
}: {
  category: Category
  challengeText: string
  completion: BoardChallenge['completions'][number]
  onReact: (kind: 'upvote' | 'pin') => void
}) {
  const caption = completion.userCaption ?? completion.autoCaption ?? challengeText

  return (
    <div className="mb-3 break-inside-avoid rounded-sm border border-line bg-card p-3 shadow-card">
      {completion.mediaDataUrl && completion.mediaType === 'photo' && (
        <img src={completion.mediaDataUrl} alt="" className="mb-2 w-full rounded-sm object-cover" />
      )}
      {completion.mediaDataUrl && completion.mediaType === 'video' && (
        <video src={completion.mediaDataUrl} controls playsInline className="mb-2 w-full rounded-sm bg-ink" />
      )}
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
        <CATEGORY_ICON category={category} size={11} />
        {CATEGORY_META[category].label}
      </p>
      <p className="mt-1 text-sm leading-snug text-ink">{caption}</p>
      <p className="mt-1.5 text-[11px] text-ink-faint">@{completion.completerUsername}</p>

      <div className="mt-2 flex gap-3 border-t border-line pt-2">
        <button
          onClick={() => onReact('upvote')}
          className={clsx('flex items-center gap-1 text-xs', completion.upvotedByMe ? 'text-accent' : 'text-ink-faint')}
        >
          <UpvoteIcon size={14} /> {completion.upvotes}
        </button>
        <button
          onClick={() => onReact('pin')}
          className={clsx('flex items-center gap-1 text-xs', completion.pinnedByMe ? 'text-accent' : 'text-ink-faint')}
        >
          <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </div>
  )
}
