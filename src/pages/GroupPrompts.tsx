import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon } from '../components/Icons'
import {
  getSentGroupPrompts,
  getReceivedGroupPrompts,
  type SentGroupItem,
  type ReceivedGroupItem,
} from '../lib/groupPromptsApi'
import { useEffectGuard } from '../lib/useEffectGuard'

function deadlineLabel(deadlineAt: number | null): string {
  if (!deadlineAt) return ''
  const ms = deadlineAt - Date.now()
  if (ms <= 0) return 'deadline passed'
  const hours = Math.ceil(ms / (60 * 60 * 1000))
  if (hours < 24) return `${hours}h left`
  return `${Math.ceil(hours / 24)}d left`
}

export function GroupPrompts() {
  const account = useStore((s) => s.account)
  const [tab, setTab] = useState<'sent' | 'received'>('received')
  const [sent, setSent] = useState<SentGroupItem[]>([])
  const [received, setReceived] = useState<ReceivedGroupItem[]>([])
  const startGuard = useEffectGuard()

  useEffect(() => {
    if (!account) return
    const isCurrent = startGuard()
    Promise.all([getSentGroupPrompts(account.token), getReceivedGroupPrompts(account.token)]).then(([s, r]) => {
      if (!isCurrent()) return
      if (s.ok) setSent(s.data)
      if (r.ok) setReceived(r.data)
    })
  }, [account, startGuard])

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to see group prompts.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Group prompts</h1>
        <Link to="/real/send/group" className="text-xs text-ink-faint underline underline-offset-2">
          + New
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('received')}
          className={clsx('rounded-full border px-3 py-1.5 text-sm', tab === 'received' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft')}
        >
          Received
        </button>
        <button
          onClick={() => setTab('sent')}
          className={clsx('rounded-full border px-3 py-1.5 text-sm', tab === 'sent' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft')}
        >
          Sent
        </button>
      </div>

      {tab === 'received' && (
        <div className="flex flex-col gap-2">
          {received.length === 0 && <p className="p-4 text-center text-sm text-ink-faint">Nothing here yet.</p>}
          {received.map((item) => (
            <Link
              key={item.groupId}
              to={`/groups/${item.groupId}`}
              className="flex items-center justify-between rounded-sm border border-line bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <CATEGORY_ICON category={item.category} size={16} />
                <div>
                  <p className="text-sm">{item.text}</p>
                  <p className="text-xs text-ink-faint">
                    From {item.senderDisplayName}
                    {item.sealed && !item.revealedAt && ' · sealed'}
                    {item.late && ' · late'}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-faint">
                {item.myStatus !== 'completed' ? 'Answer' : item.revealedAt ? 'Open' : `Waiting (${item.completed}/${item.total})`}
              </span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'sent' && (
        <div className="flex flex-col gap-2">
          {sent.length === 0 && <p className="p-4 text-center text-sm text-ink-faint">You haven't sent a group prompt yet.</p>}
          {sent.map((item) => (
            <Link key={item.id} to={`/groups/${item.id}`} className="flex items-center justify-between rounded-sm border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <CATEGORY_ICON category={item.category as Category} size={16} />
                <div>
                  <p className="text-sm">{item.text}</p>
                  <p className="text-xs text-ink-faint">
                    {CATEGORY_META[item.category as Category]?.label}
                    {item.cancelled && ' · cancelled'}
                    {item.sealed && !item.revealedAt && !item.cancelled && ` · ${deadlineLabel(item.deadlineAt)}`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-faint">
                {item.revealedAt ? 'Open' : `${item.completed} of ${item.total} done`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
