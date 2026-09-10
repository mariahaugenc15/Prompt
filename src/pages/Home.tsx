import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, todayKey } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { computeCompletionScore } from '../lib/completionScore'
import { CalendarGrid } from '../components/CalendarGrid'
import { FridgeNoteStack, FridgeNoteDetail } from '../components/FridgeNote'
import { DayDetailSheet } from '../components/DayDetailSheet'
import type { Prompt } from '../lib/types'
import { PlusIcon } from '../components/Icons'

export function Home() {
  const navigate = useNavigate()
  const prompts = useStore((s) => s.prompts)
  const users = useStore((s) => s.users)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)
  const acceptPrompt = useStore((s) => s.acceptPrompt)
  const declinePrompt = useStore((s) => s.declinePrompt)

  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [tossing, setTossing] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const now = new Date()
  const pending = useMemo(() => prompts.filter((p) => p.toUserId === CURRENT_USER_ID && p.status === 'pending'), [prompts])
  const score = useMemo(() => computeCompletionScore(CURRENT_USER_ID, prompts), [prompts])
  const openNote = pending.find((p) => p.id === openNoteId)

  function senderFor(p: Prompt) {
    return users.find((u) => u.id === p.fromUserId)
  }

  function handleAccept() {
    if (!openNote) return
    acceptPrompt(openNote.id)
    setOpenNoteId(null)
  }

  // Your own backlog first — a pending fridge note, then anything already
  // accepted for today — and only once there's genuinely nothing waiting
  // does this send you off to find something new.
  function handleCompletePrompt() {
    if (pending.length > 0) {
      setOpenNoteId(pending[0].id)
      return
    }
    const acceptedToday = prompts.find((p) => p.toUserId === CURRENT_USER_ID && p.status === 'accepted' && p.dayKey === todayKey())
    if (acceptedToday) {
      setSelectedDay(todayKey())
      return
    }
    navigate('/explore')
  }

  function handleDecline() {
    if (!openNote) return
    setTossing(true)
    setTimeout(() => {
      declinePrompt(openNote.id)
      setOpenNoteId(null)
      setTossing(false)
    }, 420)
  }

  return (
    <div className="flex flex-col gap-4">
      <FridgeNoteStack prompts={pending} sender={senderFor} onOpen={(p) => setOpenNoteId(p.id)} />

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

      {openNote && (
        <FridgeNoteDetail
          prompt={openNote}
          sender={senderFor(openNote)}
          tossing={tossing}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onClose={() => setOpenNoteId(null)}
        />
      )}

      {selectedDay && <DayDetailSheet dayKey={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}
