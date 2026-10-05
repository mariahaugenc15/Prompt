import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { Category } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, LockIcon, PinIcon } from '../components/Icons'
import { AudioProofPlayer } from '../components/AudioProofPlayer'
import { ReactionBar } from '../components/ReactionBar'
import { CompletionDetailModal } from '../components/CompletionDetailModal'
import { reactToCompletion, type ReactionKind } from '../lib/calendarsApi'
import { getMe } from '../lib/realAccountsApi'
import {
  getBoard,
  getBoardChallenges,
  getTopFans,
  inviteToBoard,
  postBoardChallenge,
  setBoardAdultFlag,
  setBoardTopFansVisibility,
  subscribeBoard,
  type BoardChallenge,
  type RealBoard,
  type TopFan,
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

  const [adultOptedIn, setAdultOptedIn] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [adultFlagBusy, setAdultFlagBusy] = useState(false)

  const [topFans, setTopFans] = useState<TopFan[]>([])
  const [topFansVisBusy, setTopFansVisBusy] = useState(false)

  function refresh() {
    if (!boardId) return
    getBoard(boardId, account?.token).then((res) => setBoard(res.ok ? res.data : 'not-found'))
    getBoardChallenges(boardId, account?.token).then((res) => setChallenges(res.ok ? res.data : []))
  }

  useEffect(refresh, [boardId, account?.token])

  const boardIsOwner = board && board !== 'not-found' ? board.isOwner : false
  const boardTopFansPublic = board && board !== 'not-found' ? board.topFansPublic : false

  useEffect(() => {
    if (!boardId || !account) return
    if (!boardIsOwner && !boardTopFansPublic) return
    getTopFans(boardId, account.token).then((res) => setTopFans(res.ok ? res.data : []))
  }, [boardId, account, boardIsOwner, boardTopFansPublic])

  useEffect(() => {
    if (account) getMe(account.token).then((res) => { if (res.ok) setAdultOptedIn(res.data.adultContentOptIn) })
  }, [account])

  // Tap-to-confirm resets per board visited, not just per app session.
  useEffect(() => setAgeConfirmed(false), [boardId])

  useEffect(() => {
    if (board === 'not-found') navigate('/feed')
  }, [board, navigate])

  if (!board || board === 'not-found') return null

  async function handleToggleAdultFlag(isAdult: boolean) {
    if (!account || board === 'not-found' || !board) return
    setAdultFlagBusy(true)
    try {
      const res = await setBoardAdultFlag(board.id, isAdult, account.token)
      if (res.ok) setBoard(res.data)
    } finally {
      setAdultFlagBusy(false)
    }
  }

  async function handleToggleTopFansVisibility(isPublic: boolean) {
    if (!account || board === 'not-found' || !board) return
    setTopFansVisBusy(true)
    try {
      const res = await setBoardTopFansVisibility(board.id, isPublic, account.token)
      if (res.ok) setBoard(res.data)
    } finally {
      setTopFansVisBusy(false)
    }
  }

  const needsAdultGate = board.isAdult && !board.isOwner && !(adultOptedIn && ageConfirmed)

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

  async function handleReact(completionId: string, kind: ReactionKind | 'pin') {
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
    <div className="relative flex flex-col gap-5 p-4">
      <div className={clsx(needsAdultGate && 'pointer-events-none select-none blur-md', 'flex flex-col gap-5')}>
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
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Board settings</p>
          <label className="flex items-center justify-between text-sm">
            <span>
              <span className="block font-medium">Adult content (18+)</span>
              <span className="block text-xs text-ink-faint">Excluded from Discover and search for anyone who hasn't opted in.</span>
            </span>
            <input
              type="checkbox"
              checked={board.isAdult}
              disabled={adultFlagBusy}
              onChange={(e) => handleToggleAdultFlag(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
          <label className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span>
              <span className="block font-medium">Show Top Fans publicly</span>
              <span className="block text-xs text-ink-faint">Off keeps the ranking visible to only you.</span>
            </span>
            <input
              type="checkbox"
              checked={board.topFansPublic}
              disabled={topFansVisBusy}
              onChange={(e) => handleToggleTopFansVisibility(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
        </section>
      )}

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

      {(boardIsOwner || boardTopFansPublic) && topFans.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">
            Top Fans{!boardIsOwner && boardTopFansPublic ? '' : boardIsOwner && !boardTopFansPublic ? ' (owner-only)' : ''}
          </p>
          <div className="flex flex-col gap-1.5">
            {topFans.slice(0, 20).map((fan, i) => (
              <div key={fan.accountId} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2 text-sm">
                <span className="w-5 shrink-0 text-center font-serif text-ink-faint">{i + 1}</span>
                <span className="flex-1 truncate">@{fan.username}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {Math.round(fan.responseRate * 100)}% · {fan.completed}/{fan.received}
                </span>
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
                  boardName={board.name}
                  completion={completion}
                  onReact={(kind) => handleReact(completion.id, kind)}
                />
              )),
            )}
          </div>
        )}
      </section>
      </div>

      {needsAdultGate && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-sm bg-paper/85 p-6 text-center">
          <p className="font-serif text-lg leading-snug">This board is marked 18+</p>
          {adultOptedIn ? (
            <>
              <p className="max-w-xs text-sm text-ink-soft">Confirm you're 18 or older to view it.</p>
              <button onClick={() => setAgeConfirmed(true)} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper">
                I'm 18 or older, show this board
              </button>
            </>
          ) : (
            <>
              <p className="max-w-xs text-sm text-ink-soft">
                Turn on "Show adult (18+) boards" in your profile settings to view it.
              </p>
              <Link to="/profile/edit" className="rounded-sm border border-ink px-4 py-2 text-sm font-medium">
                Go to settings
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ChallengeCompletionCard({
  category,
  challengeText,
  boardName,
  completion,
  onReact,
}: {
  category: Category
  challengeText: string
  boardName: string
  completion: BoardChallenge['completions'][number]
  onReact: (kind: ReactionKind | 'pin') => void
}) {
  const account = useStore((s) => s.account)
  const caption = completion.userCaption ?? completion.autoCaption ?? challengeText
  const isMine = completion.completerUsername === account?.username
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        className="mb-3 break-inside-avoid cursor-pointer rounded-sm border border-line bg-card p-3 shadow-card"
      >
        {completion.mediaDataUrl && completion.mediaType === 'photo' && (
          <img src={completion.mediaDataUrl} alt="" className="mb-2 w-full rounded-sm object-cover" />
        )}
        {completion.mediaDataUrl && completion.mediaType === 'video' && (
          <video src={completion.mediaDataUrl} controls playsInline onClick={(e) => e.stopPropagation()} className="mb-2 w-full rounded-sm bg-ink" />
        )}
        {completion.mediaDataUrl && completion.mediaType === 'audio' && (
          <div onClick={(e) => e.stopPropagation()}>
            <AudioProofPlayer src={completion.mediaDataUrl} />
          </div>
        )}
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
          <CATEGORY_ICON category={category} size={11} />
          {CATEGORY_META[category].label}
        </p>
        <p className="mt-1 text-sm leading-snug text-ink">{caption}</p>
        <p className="mt-1.5 text-[11px] text-ink-faint">@{completion.completerUsername}</p>

        <div className="mt-2 flex items-center gap-3 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
          <ReactionBar
            likes={completion.likes}
            dislikes={completion.dislikes}
            laughs={completion.laughs}
            myReaction={completion.myReaction}
            onReact={onReact}
          />
          <button
            onClick={() => onReact('pin')}
            className={clsx('flex items-center gap-1 text-xs', completion.pinnedByMe ? 'text-accent' : 'text-ink-faint')}
          >
            <PinIcon size={14} /> {completion.pinnedByMe ? 'Pinned' : 'Pin'}
          </button>
        </div>
      </div>

      {expanded && (
        <CompletionDetailModal
          completion={{
            id: completion.id,
            category,
            text: challengeText,
            userCaption: completion.userCaption,
            mediaType: completion.mediaType,
            mediaDataUrl: completion.mediaDataUrl,
            completerDisplayName: completion.completerUsername,
            boardName,
            isSelfSent: false,
            likes: completion.likes,
            dislikes: completion.dislikes,
            laughs: completion.laughs,
            pins: completion.pins,
            myReaction: completion.myReaction,
            pinnedByMe: completion.pinnedByMe,
          }}
          isMine={isMine}
          token={account?.token}
          onReact={onReact}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}
