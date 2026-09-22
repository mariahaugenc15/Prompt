import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import type { Category } from '../lib/types'
import { CalendarGrid } from '../components/CalendarGrid'
import { FridgeNoteStack, FridgeNoteDetail, type FridgeNoteViewModel } from '../components/FridgeNote'
import { DayDetailSheet } from '../components/DayDetailSheet'
import { RealCompleteForm } from '../components/RealCompleteForm'
import { UnplugCompleteForm } from '../components/UnplugCompleteForm'
import { CompletionFeedCard } from '../components/CompletionFeedCard'
import { PlusIcon, CloseIcon, BoardsIcon } from '../components/Icons'
import {
  getActiveBroadcasts,
  getCompletionScore,
  getPromptHistory,
  completePrompt,
  declinePrompt,
  type ActiveBroadcastItem,
  type OneToOneHistoryItem,
} from '../lib/realAccountsApi'
import { reactToCompletion, tagCompletion, getMyCalendars, type CompletionView, type RealCalendar } from '../lib/calendarsApi'
import { getMyActivity, getFollowingFeed, getCommunityFeed } from '../lib/feedApi'
import { getMyBoards, type RealBoard } from '../lib/boardsApi'

const FEED_PAGE_SIZE = 20

const POLL_MS = 15000

async function notifyNewPrompt(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }
  try {
    // Android requires notifications to be shown through an active service
    // worker registration — calling `new Notification()` directly throws
    // there. Desktop browsers are fine with either, so this path covers
    // both instead of silently failing on the phones this app is mostly
    // used on.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    // Best-effort only — the fridge note itself is the real source of
    // truth, so a notification failure here should never block anything.
  }
}

export function Home() {
  const navigate = useNavigate()
  const account = useStore((s) => s.account)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)

  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const now = new Date()

  const [activity, setActivity] = useState<CompletionView[]>([])
  const [myCalendars, setMyCalendars] = useState<RealCalendar[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [oneToOne, setOneToOne] = useState<OneToOneHistoryItem[]>([])
  const [broadcasts, setBroadcasts] = useState<ActiveBroadcastItem[]>([])
  const [completingBroadcast, setCompletingBroadcast] = useState<ActiveBroadcastItem | null>(null)
  const [completingBusy, setCompletingBusy] = useState(false)
  const seenPendingIds = useRef<Set<string> | null>(null)

  // The live feed of calendars and boards you follow — prompts and other
  // people's completions, kept separate from "activity" above (your own
  // calendar, used to render the month grid).
  const [feedTab, setFeedTab] = useState<'following' | 'boards'>('following')
  const [followingFeed, setFollowingFeed] = useState<CompletionView[]>([])
  const [communityFeed, setCommunityFeed] = useState<CompletionView[]>([])
  const [followingHasMore, setFollowingHasMore] = useState(false)
  const [communityHasMore, setCommunityHasMore] = useState(false)
  const [feedLoadingMore, setFeedLoadingMore] = useState(false)
  const [myBoards, setMyBoards] = useState<RealBoard[]>([])

  function refreshActivity() {
    if (!account) return
    getMyActivity(account.token).then((res) => { if (res.ok) setActivity(res.data) })
    getCompletionScore(account.token).then((res) => { if (res.ok) setScore(res.data.score) })
  }

  useEffect(() => {
    if (!account) return
    getMyCalendars(account.token).then((res) => { if (res.ok) setMyCalendars(res.data) })
    getMyBoards(account.token).then((res) => { if (res.ok) setMyBoards(res.data) })
    refreshActivity()
    getFollowingFeed(account.token, 0, FEED_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setFollowingFeed(res.data)
      setFollowingHasMore(res.data.length === FEED_PAGE_SIZE)
    })
    getCommunityFeed(account.token, 0, FEED_PAGE_SIZE).then((res) => {
      if (!res.ok) return
      setCommunityFeed(res.data)
      setCommunityHasMore(res.data.length === FEED_PAGE_SIZE)
    })
  }, [account])

  async function handleFeedReact(list: 'following' | 'boards', completionId: string, kind: 'upvote' | 'pin') {
    if (!account) return
    const res = await reactToCompletion(completionId, kind, account.token)
    if (!res.ok) return
    const patch = (items: CompletionView[]) => items.map((c) => (c.id === completionId ? { ...c, ...res.data } : c))
    if (list === 'following') setFollowingFeed(patch)
    else setCommunityFeed(patch)
  }

  async function handleFeedLoadMore(list: 'following' | 'boards') {
    if (!account) return
    setFeedLoadingMore(true)
    try {
      if (list === 'following') {
        const res = await getFollowingFeed(account.token, followingFeed.length, FEED_PAGE_SIZE)
        if (res.ok) {
          setFollowingFeed((prev) => [...prev, ...res.data])
          setFollowingHasMore(res.data.length === FEED_PAGE_SIZE)
        }
      } else {
        const res = await getCommunityFeed(account.token, communityFeed.length, FEED_PAGE_SIZE)
        if (res.ok) {
          setCommunityFeed((prev) => [...prev, ...res.data])
          setCommunityHasMore(res.data.length === FEED_PAGE_SIZE)
        }
      }
    } finally {
      setFeedLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!account) return
    let cancelled = false
    async function poll() {
      const [historyRes, broadcastRes] = await Promise.all([getPromptHistory(account!.token), getActiveBroadcasts(account!.token)])
      if (cancelled) return

      if (historyRes.ok) {
        const received = historyRes.data.oneToOne.filter((item) => item.recipientUsername === account!.username)
        setOneToOne(received)
      }

      if (broadcastRes.ok) {
        const pendingIds = broadcastRes.data.map((item) => item.id)
        if (seenPendingIds.current === null) {
          // The first fetch after landing on this page — these were
          // already sitting there, so don't fire a notification for every
          // one of them at once.
          seenPendingIds.current = new Set(pendingIds)
        } else {
          for (const item of broadcastRes.data) {
            if (!seenPendingIds.current.has(item.id)) {
              seenPendingIds.current.add(item.id)
              notifyNewPrompt(`${item.senderDisplayName} sent you a prompt`, item.text)
            }
          }
        }
        setBroadcasts(broadcastRes.data)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [account])

  // 1:1 pending notifications use the same seen-tracking as broadcasts, kept
  // separate since they come from a different endpoint.
  const seenOneToOnePendingIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const pendingIds = oneToOne.filter((p) => p.status === 'pending').map((p) => p.id)
    if (seenOneToOnePendingIds.current === null) {
      seenOneToOnePendingIds.current = new Set(pendingIds)
      return
    }
    for (const p of oneToOne) {
      if (p.status === 'pending' && !seenOneToOnePendingIds.current.has(p.id)) {
        seenOneToOnePendingIds.current.add(p.id)
        notifyNewPrompt(`${p.senderDisplayName} sent you a prompt`, p.promptText)
      }
    }
  }, [oneToOne])

  async function handleCompleteBroadcast(input: { mediaType?: string; mediaDataUrl?: string; caption?: string }) {
    if (!completingBroadcast || !account) return
    setCompletingBusy(true)
    try {
      const res = await completePrompt(completingBroadcast.id, input, account.token)
      if (res.ok) {
        setBroadcasts((prev) => prev.filter((b) => b.id !== completingBroadcast.id))
        setCompletingBroadcast(null)
        refreshActivity()
      }
    } finally {
      setCompletingBusy(false)
    }
  }

  async function handleCompleteOneToOne(item: OneToOneHistoryItem, input: { mediaType?: string; mediaDataUrl?: string; caption?: string }) {
    if (!account) return
    const res = await completePrompt(item.id, input, account.token)
    if (res.ok) {
      setOneToOne((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, status: 'completed', mediaType: res.data.mediaType, mediaDataUrl: res.data.mediaDataUrl, autoCaption: res.data.autoCaption, userCaption: res.data.userCaption }
            : p,
        ),
      )
      refreshActivity()
    }
  }

  async function handleDeclineOneToOne(item: OneToOneHistoryItem) {
    if (!account) return
    setOpenNoteId(null)
    const res = await declinePrompt(item.id, account.token)
    if (res.ok) {
      // The record itself stays (viewable later in Edit Profile's Declined
      // prompts section) — this just clears it from the fridge-note stack
      // immediately rather than waiting out the next 15s poll, which would
      // otherwise still filter it out anyway (see the notes memo below).
      setOneToOne((prev) => prev.filter((p) => p.id !== item.id))
    }
  }

  const [completingOneToOne, setCompletingOneToOne] = useState<OneToOneHistoryItem | null>(null)
  const [completingOneToOneBusy, setCompletingOneToOneBusy] = useState(false)

  async function submitOneToOneCompletion(input: { mediaType?: string; mediaDataUrl?: string; caption?: string }) {
    if (!completingOneToOne) return
    setCompletingOneToOneBusy(true)
    try {
      await handleCompleteOneToOne(completingOneToOne, input)
      setCompletingOneToOne(null)
    } finally {
      setCompletingOneToOneBusy(false)
    }
  }

  const notes: FridgeNoteViewModel[] = useMemo(() => {
    // The top stack is for prompts still waiting on you — once a 1:1 prompt
    // is completed it belongs on the calendar, viewable by clicking into
    // the day it happened, not pinned here forever growing the strip. A
    // declined prompt is dropped the same way (see handleDeclineOneToOne).
    const oneToOneNotes: FridgeNoteViewModel[] = oneToOne
      .filter((item): item is typeof item & { status: 'pending' } => item.status === 'pending')
      .map((item) => ({
        id: item.id,
        category: item.category,
        text: item.promptText,
        selfSent: false,
        status: item.status,
        stackLabel: item.senderDisplayName,
        detailSourceLabel: `From ${item.senderDisplayName}`,
        onAccept: () => { setOpenNoteId(null); setCompletingOneToOne(item) },
        onDecline: () => handleDeclineOneToOne(item),
      }))
    const broadcastNotes: FridgeNoteViewModel[] = broadcasts.map((item) => ({
      id: item.id,
      category: item.category,
      text: item.text,
      selfSent: false,
      status: 'pending',
      stackLabel: item.boardName ?? item.senderDisplayName,
      detailSourceLabel: item.boardName ? `From ${item.boardName}` : `From ${item.senderDisplayName}`,
      onAccept: () => { setOpenNoteId(null); setCompletingBroadcast(item) },
    }))
    return [...broadcastNotes, ...oneToOneNotes]
  }, [oneToOne, broadcasts])

  const openNote = notes.find((n) => n.id === openNoteId)

  function handleCompletePrompt() {
    const actionable = notes.find((n) => n.status === 'pending')
    if (actionable) {
      setOpenNoteId(actionable.id)
      return
    }
    navigate('/explore')
  }

  const dayCompletions = selectedDay ? activity.filter((c) => c.dayKey === selectedDay) : []

  async function handleReact(completionId: string, kind: 'upvote' | 'pin') {
    if (!account) return
    const res = await reactToCompletion(completionId, kind, account.token)
    if (res.ok) {
      setActivity((prev) => prev.map((c) => (c.id === completionId ? { ...c, ...res.data } : c)))
    }
  }

  async function handleTag(completionId: string, calendarIds: string[]) {
    if (!account) return
    const res = await tagCompletion(completionId, calendarIds, account.token)
    if (res.ok) {
      setActivity((prev) =>
        prev.map((c) =>
          c.id === completionId
            ? { ...c, calendarIds: res.data.calendarIds, calendarNames: myCalendars.filter((cal) => res.data.calendarIds.includes(cal.id)).map((cal) => cal.name) }
            : c,
        ),
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FridgeNoteStack notes={notes} onOpen={setOpenNoteId} />

      <div className="flex items-center justify-between px-4 pt-2">
        <div>
          <h1 className="font-serif text-2xl leading-none">{now.toLocaleDateString(undefined, { month: 'long' })}</h1>
          <p className="text-xs text-ink-faint">{now.getFullYear()} · All Activity</p>
        </div>
        {!hideCompletionScore && (
          <div className="max-w-[45%] text-right">
            {score === null ? (
              <p className="text-xs italic leading-snug text-ink-faint">Not available: complete your first prompt!</p>
            ) : (
              <>
                <p className="font-serif text-2xl leading-none text-accent">{score}%</p>
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">Completion score</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-4">
        <CalendarGrid year={now.getFullYear()} month={now.getMonth()} completions={activity} onDayClick={setSelectedDay} />
      </div>

      <div className="flex gap-2 px-4">
        <Link
          to="/real/send"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-ink bg-ink py-2.5 text-sm font-medium text-paper"
        >
          <PlusIcon size={15} /> Send a prompt
        </Link>
        <button
          onClick={handleCompletePrompt}
          className="flex-1 rounded-sm border border-line py-2.5 text-sm text-ink-soft transition hover:border-line-strong"
        >
          Complete a prompt
        </button>
      </div>

      <div className="px-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
          <Link to="/boards/new" className="text-xs font-medium text-ink underline underline-offset-2">
            + New
          </Link>
        </div>
        {myBoards.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No boards yet,{' '}
            <Link to="/feed" className="underline">
              find one to follow
            </Link>
            .
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {myBoards.map((b) => (
              <Link
                key={b.id}
                to={`/boards/${b.id}`}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card px-3 py-1.5 text-xs"
              >
                {b.icon ? <span>{b.icon}</span> : <BoardsIcon size={13} />}
                {b.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="px-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Your feed</p>
        <div className="mb-3 flex gap-2">
          {(['following', 'boards'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFeedTab(t)}
              className={clsx(
                'flex-1 rounded-full border py-1.5 text-xs capitalize transition',
                feedTab === t ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              {t === 'following' ? 'Following' : 'Boards'}
            </button>
          ))}
        </div>
        {(feedTab === 'following' ? followingFeed : communityFeed).length === 0 ? (
          <p className="text-sm text-ink-faint">
            {feedTab === 'following' ? 'Follow friends to see what they’ve actually done.' : 'Subscribe to a board to see its gallery.'}
          </p>
        ) : (
          <>
            <div className="columns-2 gap-3">
              {(feedTab === 'following' ? followingFeed : communityFeed).map((c) => (
                <CompletionFeedCard key={c.id} completion={c} token={account?.token} onReact={(kind) => handleFeedReact(feedTab, c.id, kind)} />
              ))}
            </div>
            {(feedTab === 'following' ? followingHasMore : communityHasMore) && (
              <button
                onClick={() => handleFeedLoadMore(feedTab)}
                disabled={feedLoadingMore}
                className="mt-1 w-full rounded-sm border border-line py-2 text-sm text-ink-soft disabled:opacity-50"
              >
                {feedLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      {openNote && <FridgeNoteDetail note={openNote} onClose={() => setOpenNoteId(null)} />}

      {completingBroadcast && (
        <CompleteModal
          category={completingBroadcast.category}
          senderDisplayName={completingBroadcast.senderDisplayName}
          promptText={completingBroadcast.text}
          submitting={completingBusy}
          onClose={() => setCompletingBroadcast(null)}
          onSubmit={handleCompleteBroadcast}
        />
      )}

      {completingOneToOne && (
        <CompleteModal
          category={completingOneToOne.category}
          senderDisplayName={completingOneToOne.senderDisplayName}
          promptText={completingOneToOne.promptText}
          submitting={completingOneToOneBusy}
          onClose={() => setCompletingOneToOne(null)}
          onSubmit={submitOneToOneCompletion}
        />
      )}

      {selectedDay && (
        <DayDetailSheet
          dayKey={selectedDay}
          completions={dayCompletions}
          myUsername={account?.username}
          token={account?.token}
          myCalendars={myCalendars}
          onClose={() => setSelectedDay(null)}
          onReact={handleReact}
          onTag={handleTag}
        />
      )}
    </div>
  )
}

function CompleteModal({
  category,
  senderDisplayName,
  promptText,
  submitting,
  onClose,
  onSubmit,
}: {
  category: Category
  senderDisplayName: string
  promptText: string
  submitting: boolean
  onClose: () => void
  onSubmit: (input: { mediaType?: string; mediaDataUrl?: string; caption?: string }) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xs rounded-sm border border-line bg-card p-5 shadow-note">
        <button onClick={onClose} className="absolute right-0 top-0 p-3 text-ink-faint">
          <CloseIcon size={16} />
        </button>
        <p className="mb-3 font-serif text-lg leading-snug text-ink">Complete this prompt</p>
        {category === 'unplug' ? (
          <UnplugCompleteForm senderDisplayName={senderDisplayName} promptText={promptText} submitting={submitting} onSubmit={onSubmit} />
        ) : (
          <RealCompleteForm senderDisplayName={senderDisplayName} promptText={promptText} submitting={submitting} onSubmit={onSubmit} />
        )}
      </div>
    </div>
  )
}
