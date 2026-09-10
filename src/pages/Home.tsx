import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, todayKey } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { computeCompletionScore } from '../lib/completionScore'
import { CalendarGrid } from '../components/CalendarGrid'
import { FridgeNoteStack, FridgeNoteDetail, type FridgeNoteViewModel } from '../components/FridgeNote'
import { DayDetailSheet } from '../components/DayDetailSheet'
import { RealCompleteForm } from '../components/RealCompleteForm'
import type { Prompt } from '../lib/types'
import { PlusIcon, CloseIcon } from '../components/Icons'
import { getInbox, completePrompt, type InboxItem } from '../lib/realAccountsApi'

const REAL_INBOX_POLL_MS = 15000

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
  const prompts = useStore((s) => s.prompts)
  const users = useStore((s) => s.users)
  const account = useStore((s) => s.account)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)
  const acceptPrompt = useStore((s) => s.acceptPrompt)

  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const now = new Date()
  const pending = useMemo(() => prompts.filter((p) => p.toUserId === CURRENT_USER_ID && p.status === 'pending'), [prompts])
  const score = useMemo(() => computeCompletionScore(CURRENT_USER_ID, prompts), [prompts])

  function senderFor(p: Prompt) {
    return users.find((u) => u.id === p.fromUserId)
  }

  // Real, server-backed 1:1 prompts sent directly to this account — polled
  // regularly so a prompt someone just sent shows up as a fridge note (and
  // triggers a notification) without needing a manual refresh.
  const [realItems, setRealItems] = useState<InboxItem[]>([])
  const [completingReal, setCompletingReal] = useState<InboxItem | null>(null)
  const [completingBusy, setCompletingBusy] = useState(false)
  const seenRealIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!account) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    let cancelled = false
    async function poll() {
      const res = await getInbox(account!.token)
      if (cancelled || !res.ok) return
      const oneToOne = res.data.filter((item) => !item.isBroadcast)
      if (seenRealIds.current === null) {
        // The first fetch after landing on this page — these prompts were
        // already sitting there, so treat them as "already seen" rather
        // than firing a notification for every one of them at once.
        seenRealIds.current = new Set(oneToOne.map((i) => i.id))
      } else {
        for (const item of oneToOne) {
          if (!seenRealIds.current.has(item.id)) {
            seenRealIds.current.add(item.id)
            notifyNewPrompt(`${item.senderDisplayName} sent you a prompt`, item.text)
          }
        }
      }
      setRealItems(oneToOne)
    }

    poll()
    const interval = setInterval(poll, REAL_INBOX_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [account])

  async function handleCompleteReal(input: { mediaType: string; mediaDataUrl: string; caption?: string }) {
    if (!completingReal || !account) return
    setCompletingBusy(true)
    try {
      const res = await completePrompt(completingReal.id, input, account.token)
      if (res.ok) {
        setRealItems((prev) => prev.filter((i) => i.id !== completingReal.id))
        setCompletingReal(null)
      }
    } finally {
      setCompletingBusy(false)
    }
  }

  const notes: FridgeNoteViewModel[] = useMemo(() => {
    const mockNotes: FridgeNoteViewModel[] = pending.map((p) => {
      const from = p.anonymous ? undefined : senderFor(p)
      const selfSent = p.fromUserId === CURRENT_USER_ID
      return {
        id: p.id,
        category: p.category,
        text: p.text,
        selfSent,
        stackLabel: p.boardId ? (selfSent ? 'Your board' : 'Board prompt') : from ? from.name : 'Someone sent you a prompt',
        detailSourceLabel: p.boardId
          ? selfSent
            ? 'From a board you created'
            : 'From a board you follow'
          : p.anonymous
            ? 'From someone who wants to stay a secret'
            : `From ${from?.name ?? 'a friend'}`,
        onAccept: () => {
          acceptPrompt(p.id)
          setOpenNoteId(null)
          setSelectedDay(todayKey())
        },
      }
    })
    const realNotes: FridgeNoteViewModel[] = realItems.map((item) => ({
      id: item.id,
      category: item.category,
      text: item.text,
      selfSent: false,
      stackLabel: item.senderDisplayName,
      detailSourceLabel: `From ${item.senderDisplayName}`,
      onAccept: () => {
        setOpenNoteId(null)
        setCompletingReal(item)
      },
    }))
    // Real prompts first — an actual person is waiting on these.
    return [...realNotes, ...mockNotes]
  }, [pending, realItems, users])

  const openNote = notes.find((n) => n.id === openNoteId)

  // Your own backlog first — a pending fridge note, then anything already
  // accepted for today — and only once there's genuinely nothing waiting
  // does this send you off to find something new.
  function handleCompletePrompt() {
    if (notes.length > 0) {
      setOpenNoteId(notes[0].id)
      return
    }
    const acceptedToday = prompts.find((p) => p.toUserId === CURRENT_USER_ID && p.status === 'accepted' && p.dayKey === todayKey())
    if (acceptedToday) {
      setSelectedDay(todayKey())
      return
    }
    navigate('/explore')
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
        <CalendarGrid year={now.getFullYear()} month={now.getMonth()} prompts={prompts} onDayClick={setSelectedDay} />
      </div>

      <div className="flex gap-2 px-4">
        <Link
          to="/send"
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

      {openNote && <FridgeNoteDetail note={openNote} onClose={() => setOpenNoteId(null)} />}

      {completingReal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={() => setCompletingReal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xs rounded-sm border border-line bg-card p-5 shadow-note">
            <button onClick={() => setCompletingReal(null)} className="absolute right-0 top-0 p-3 text-ink-faint">
              <CloseIcon size={16} />
            </button>
            <p className="mb-3 font-serif text-lg leading-snug text-ink">Complete this prompt</p>
            <RealCompleteForm
              senderDisplayName={completingReal.senderDisplayName}
              promptText={completingReal.text}
              submitting={completingBusy}
              onSubmit={handleCompleteReal}
            />
          </div>
        </div>
      )}

      {selectedDay && <DayDetailSheet dayKey={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}
