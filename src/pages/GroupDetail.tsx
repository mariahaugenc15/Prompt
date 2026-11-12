import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon } from '../components/Icons'
import { AudioProofPlayer } from '../components/AudioProofPlayer'
import { RealCompleteForm } from '../components/RealCompleteForm'
import { SoundCompleteForm } from '../components/SoundCompleteForm'
import { UnplugCompleteForm } from '../components/UnplugCompleteForm'
import { completePrompt } from '../lib/realAccountsApi'
import { getGroupDetail, getReceivedGroupPrompts, cancelGroupPrompt, type GroupDetail as GroupDetailData } from '../lib/groupPromptsApi'
import { useEffectGuard } from '../lib/useEffectGuard'

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const account = useStore((s) => s.account)
  const [detail, setDetail] = useState<GroupDetailData | null | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  // True only the first time this component sees an already-sealed group
  // show up revealed — the one moment the spec's "seal breaks, responses
  // fan out" animation plays. Opening it again later (already known to be
  // revealed) just shows the normal list, same as any other completion.
  const [justRevealed, setJustRevealed] = useState(false)
  const reduceMotion = useReducedMotion()
  const startGuard = useEffectGuard()
  // groupDetail() keys each response by username, not the underlying
  // prompts.id — completing one still needs that id (the same endpoint
  // every 1:1 completion uses), so it's fetched once from the received
  // list alongside the detail view, only relevant while still pending.
  const [myPromptId, setMyPromptId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!account || !id) return
    const isCurrent = startGuard()
    Promise.all([getGroupDetail(id, account.token), getReceivedGroupPrompts(account.token)]).then(([detailRes, receivedRes]) => {
      if (!isCurrent()) return
      if (!detailRes.ok) {
        setDetail(null)
        return
      }
      setDetail((prev) => {
        if (prev === undefined && detailRes.data.sealed && detailRes.data.revealedAt) setJustRevealed(true)
        return detailRes.data
      })
      if (receivedRes.ok) {
        const mine = receivedRes.data.find((r) => r.groupId === id)
        if (mine) setMyPromptId(mine.promptId)
      }
    })
    // startGuard intentionally excluded: useEffectGuard() returns a new
    // function identity every render, and this effect's own setState calls
    // trigger exactly that — including it here reruns the effect on every
    // render it causes, which reruns both fetches, which re-renders, forever.
    // Verified live: this was actually looping, burning through the
    // server's rate limit in well under a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, id])

  async function handleComplete(input: { mediaType?: string; mediaDataUrl?: string; caption?: string }) {
    if (!account || !detail || !myPromptId) return
    setSubmitting(true)
    setError('')
    try {
      const res = await completePrompt(myPromptId, input, account.token)
      if (!res.ok) {
        setError(Object.values(res.errors)[0] ?? 'Something went wrong.')
        return
      }
      const refreshed = await getGroupDetail(detail.id, account.token)
      if (refreshed.ok) setDetail(refreshed.data)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!account || !detail) return
    setCancelling(true)
    try {
      const res = await cancelGroupPrompt(detail.id, account.token)
      if (res.ok) {
        const refreshed = await getGroupDetail(detail.id, account.token)
        if (refreshed.ok) setDetail(refreshed.data)
      }
    } finally {
      setCancelling(false)
    }
  }

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to see this.</p>
      </div>
    )
  }

  if (detail === undefined) return <p className="p-6 text-center text-sm text-ink-faint">Loading...</p>
  if (detail === null) {
    return (
      <div className="p-6 text-center text-sm text-ink-faint">
        <p>Can't find that group prompt.</p>
        <Link to="/groups" className="mt-2 inline-block underline">
          Back to group prompts
        </Link>
      </div>
    )
  }

  const mine = detail.responses.find((r) => r.isMine)
  const revealed = Boolean(detail.revealedAt)
  const meNeedToAnswer = mine && mine.status !== 'completed'

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/groups" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Group prompts
      </Link>

      <div className="flex items-center gap-2">
        <CATEGORY_ICON category={detail.category} size={18} />
        <div>
          <h1 className="font-serif text-xl leading-snug">{detail.text}</h1>
          <p className="text-xs text-ink-faint">{CATEGORY_META[detail.category as Category]?.label}</p>
        </div>
      </div>

      {detail.cancelled && <p className="rounded-sm border border-dashed border-line p-3 text-sm italic text-ink-faint">This prompt was cancelled.</p>}

      {!detail.cancelled && meNeedToAnswer && (
        <div className="rounded-sm border border-line bg-card p-3">
          <p className="mb-2 text-sm text-ink-soft">
            {detail.sealed ? "Everyone's answers stay hidden until the last person finishes." : 'Add your answer.'}
          </p>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          {detail.category === 'unplug' ? (
            <UnplugCompleteForm
              senderDisplayName={detail.senderUsername}
              promptText={detail.text}
              submitting={submitting}
              onSubmit={(input) => handleComplete({ caption: input.caption })}
            />
          ) : detail.category === 'sound' ? (
            <SoundCompleteForm senderDisplayName={detail.senderUsername} promptText={detail.text} submitting={submitting} onSubmit={handleComplete} />
          ) : (
            <RealCompleteForm senderDisplayName={detail.senderUsername} promptText={detail.text} submitting={submitting} onSubmit={handleComplete} />
          )}
        </div>
      )}

      {!detail.cancelled && mine?.status === 'completed' && detail.sealed && !revealed && (
        <div className="rounded-sm border border-dashed border-accent bg-accent-soft/30 p-4 text-center">
          <p className="font-serif text-lg">Waiting on the others</p>
          <p className="mt-1 text-sm text-ink-faint">
            {detail.completed} of {detail.total} done
          </p>
        </div>
      )}

      {!detail.cancelled && detail.isSender && detail.sealed && !revealed && (
        <div className="rounded-sm border border-dashed border-accent bg-accent-soft/30 p-4 text-center">
          <p className="font-serif text-lg">
            {detail.completed} of {detail.total} done
          </p>
          <p className="mt-1 text-sm text-ink-faint">Opens once everyone answers, or the deadline passes.</p>
          <button onClick={handleCancel} disabled={cancelling} className="mt-3 text-xs text-ink-faint underline underline-offset-2">
            Cancel this prompt
          </button>
        </div>
      )}

      {(revealed || !detail.sealed) && (
        <motion.div
          className="flex flex-col gap-2"
          initial={justRevealed && !reduceMotion ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
        >
          {justRevealed && (
            <motion.p
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-1 text-center font-serif text-lg text-accent"
            >
              The seal is broken
            </motion.p>
          )}
          {detail.responses.map((r, i) => (
            <motion.div
              key={r.username}
              initial={justRevealed && !reduceMotion ? { opacity: 0, y: 16, rotate: i % 2 === 0 ? -3 : 3 } : false}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: justRevealed && !reduceMotion ? i * 0.12 : 0 }}
              className="rounded-sm border border-line bg-card p-3"
            >
              <p className="flex items-center justify-between text-xs uppercase tracking-wide text-ink-faint">
                <span>
                  @{r.username}
                  {r.isMine && ' (you)'}
                </span>
                {r.late && <span className="text-accent">late</span>}
              </p>
              {r.status !== 'completed' ? (
                <p className="mt-1 text-sm italic text-ink-faint">Hasn't answered</p>
              ) : (
                <>
                  {r.mediaDataUrl && r.mediaType === 'photo' && <img src={r.mediaDataUrl} className="mt-2 max-h-56 w-full rounded-sm object-cover" alt="proof" />}
                  {r.mediaDataUrl && r.mediaType === 'video' && <video src={r.mediaDataUrl} controls playsInline className="mt-2 max-h-56 w-full rounded-sm bg-ink" />}
                  {r.mediaDataUrl && r.mediaType === 'audio' && <AudioProofPlayer src={r.mediaDataUrl} className="mt-2" />}
                  {r.userCaption && <p className="mt-2 text-sm italic text-ink-soft">"{r.userCaption}"</p>}
                </>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
