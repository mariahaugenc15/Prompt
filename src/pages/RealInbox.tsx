import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CATEGORY_ICON, CloseIcon, BackIcon } from '../components/Icons'
import { RealCompleteForm } from '../components/RealCompleteForm'
import {
  completePrompt,
  declinePrompt,
  getInbox,
  type CompletionResult,
  type InboxItem,
} from '../lib/realAccountsApi'

export function RealInbox() {
  const account = useStore((s) => s.account)
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<CompletionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!account) return
    getInbox(account.token).then((res) => {
      if (res.ok) setItems(res.data)
      else setError(res.errors.form ?? 'Could not load your inbox.')
    })
  }, [account])

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need a real account to view this.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  async function handleDecline(id: string) {
    const res = await declinePrompt(id, account!.token)
    if (res.ok) setItems((prev) => prev?.filter((i) => i.id !== id) ?? null)
  }

  async function handleComplete(item: InboxItem, input: { mediaType: string; mediaDataUrl: string; caption?: string }) {
    setSubmitting(true)
    try {
      const res = await completePrompt(item.id, input, account!.token)
      if (res.ok) {
        setLastResult(res.data)
        setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null)
        setOpenId(null)
      } else {
        setError(res.errors.form ?? 'Could not complete that prompt.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/profile" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to profile
      </Link>

      <div>
        <h1 className="font-serif text-2xl">Real inbox</h1>
        <p className="text-xs text-ink-faint">
          Prompts sent to <span className="font-medium">@{account.username}</span> and broadcasts from accounts you follow.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {lastResult && (
        <div className="rounded-sm border border-line bg-card p-3">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Just completed</p>
          <p className="mt-1 text-sm italic text-ink-soft">{lastResult.autoCaption}</p>
          {lastResult.userCaption && <p className="mt-1 text-sm text-ink">{lastResult.userCaption}</p>}
          <p className="mt-1 text-xs text-ink-faint">
            {lastResult.senderDisplayName} → {lastResult.completerDisplayName}
          </p>
        </div>
      )}

      {items === null && <p className="text-sm text-ink-faint">Loading…</p>}
      {items?.length === 0 && <p className="text-sm text-ink-faint">Nothing pending. You're all caught up.</p>}

      <div className="flex flex-col gap-3">
        {items?.map((item) => (
          <div key={item.id} className="rounded-sm border border-line bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
                <CATEGORY_ICON category={item.category} size={13} />
                {item.isBroadcast ? 'Broadcast' : 'Direct'}
              </span>
              {openId === item.id && (
                <button onClick={() => setOpenId(null)} className="-m-3 p-3 text-ink-faint">
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-ink-faint">
              <span className="font-medium text-ink">{item.senderDisplayName}</span> prompted:
            </p>
            <p className="font-serif text-base">{item.text}</p>

            {openId === item.id ? (
              <div className="mt-3">
                <RealCompleteForm
                  senderDisplayName={item.senderDisplayName}
                  promptText={item.text}
                  submitting={submitting}
                  onSubmit={(input) => handleComplete(item, input)}
                />
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                {!item.isBroadcast && (
                  <button
                    onClick={() => handleDecline(item.id)}
                    className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft"
                  >
                    Decline
                  </button>
                )}
                <button onClick={() => setOpenId(item.id)} className="flex-1 rounded-sm bg-ink py-2 text-sm font-medium text-paper">
                  Complete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
