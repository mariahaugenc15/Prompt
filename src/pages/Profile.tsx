import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { computeCompletionScore } from '../lib/completionScore'
import type { PromptPermission } from '../lib/types'
import { CheckIcon } from '../components/Icons'
import { getMe, setMyPromptPermission, type Me } from '../lib/realAccountsApi'

const PERMISSIONS: { id: PromptPermission; label: string; help: string; recommended?: boolean }[] = [
  { id: 'everyone', label: 'Everyone', help: 'Any user on Prompt can send you a prompt.' },
  { id: 'followers', label: 'Followers', help: 'Only people who follow you can send you a prompt.' },
  {
    id: 'mutuals',
    label: 'Mutuals only',
    help: 'Only people you follow back — protects your score from strangers.',
    recommended: true,
  },
]

export function Profile() {
  const prompts = useStore((s) => s.prompts)
  const following = useStore((s) => s.following)
  const followers = useStore((s) => s.followers)
  const users = useStore((s) => s.users)
  const account = useStore((s) => s.account)
  const promptPermission = useStore((s) => s.promptPermission)
  const setPromptPermission = useStore((s) => s.setPromptPermission)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)
  const setHideCompletionScore = useStore((s) => s.setHideCompletionScore)

  const score = useMemo(() => computeCompletionScore(CURRENT_USER_ID, prompts), [prompts])
  const received = prompts.filter((p) => p.toUserId === CURRENT_USER_ID && !p.boardId)
  const completed = received.filter((p) => p.status === 'completed').length

  const displayName = account ? (account.firstName ?? account.organizationName ?? account.username) : 'You'
  const handle = account ? `@${account.username}` : '@you'

  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    if (account) getMe(account.token).then((res) => setMe(res.ok ? res.data : null))
  }, [account])

  async function handleRealPermission(value: PromptPermission) {
    if (!account) return
    const res = await setMyPromptPermission(value, account.token)
    if (res.ok) setMe((prev) => (prev ? { ...prev, promptPermission: value } : prev))
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-xl">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="font-serif text-xl leading-tight">{displayName}</h1>
          <p className="text-xs text-ink-faint">
            {handle} · {following.length} following · {followers.length} followers
          </p>
        </div>
      </div>

      {account && me && (
        <section className="rounded-sm border border-line bg-card p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">
            Real account — @{me.username} ({me.accountType})
          </p>
          <div className="flex gap-2">
            <Link to="/real/inbox" className="flex-1 rounded-sm border border-ink py-2 text-center text-sm font-medium">
              Real inbox
            </Link>
            {me.accountType === 'individual' && (
              <Link to="/real/send" className="flex-1 rounded-sm border border-line py-2 text-center text-sm text-ink-soft">
                Send a real prompt
              </Link>
            )}
            {me.accountType === 'organization' && (
              <Link to={`/o/${me.username}`} className="flex-1 rounded-sm border border-line py-2 text-center text-sm text-ink-soft">
                My page
              </Link>
            )}
          </div>
          {me.accountType === 'individual' && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-xs text-ink-faint">Who can send @{me.username} a real prompt</p>
              <div className="flex gap-1.5">
                {(['everyone', 'followers', 'mutuals'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleRealPermission(p)}
                    className={clsx(
                      'flex-1 rounded-sm border py-1.5 text-xs capitalize',
                      me.promptPermission === p ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-sm border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-serif text-3xl text-accent">{score}%</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Completion score</p>
          </div>
          <p className="max-w-[45%] text-right text-xs text-ink-faint">
            {completed} of {received.length} friend prompts completed
          </p>
        </div>
        <label className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          Hide my score from others
          <input
            type="checkbox"
            checked={hideCompletionScore}
            onChange={(e) => setHideCompletionScore(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
        </label>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Who can send me prompts</p>
        <div className="flex flex-col gap-2">
          {PERMISSIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPromptPermission(p.id)}
              className={clsx(
                'flex items-start gap-3 rounded-sm border p-3 text-left transition',
                promptPermission === p.id ? 'border-ink bg-paper-dim' : 'border-line bg-card',
              )}
            >
              <span
                className={clsx(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  promptPermission === p.id ? 'border-ink bg-ink text-paper' : 'border-line-strong',
                )}
              >
                {promptPermission === p.id && <CheckIcon size={10} />}
              </span>
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  {p.label}
                  {p.recommended && (
                    <span className="rounded-full border border-accent/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="text-xs text-ink-faint">{p.help}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Following</p>
        <div className="flex flex-col gap-1.5">
          {users
            .filter((u) => following.includes(u.id))
            .map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                  {u.initial}
                </span>
                <div>
                  <p className="text-sm font-medium leading-tight">{u.name}</p>
                  <p className="text-xs text-ink-faint">{u.handle}</p>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}
