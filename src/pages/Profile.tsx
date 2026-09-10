import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { computeCompletionScore } from '../lib/completionScore'
import { fileToCompressedDataUrl } from '../lib/media'
import type { PromptPermission } from '../lib/types'
import { CalendarIcon, CameraIcon, CheckIcon, LockIcon } from '../components/Icons'
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
  const navigate = useNavigate()
  const signOut = useStore((s) => s.signOut)
  const prompts = useStore((s) => s.prompts)
  const following = useStore((s) => s.following)
  const followers = useStore((s) => s.followers)
  const users = useStore((s) => s.users)
  const calendars = useStore((s) => s.calendars)
  const account = useStore((s) => s.account)
  const promptPermission = useStore((s) => s.promptPermission)
  const setPromptPermission = useStore((s) => s.setPromptPermission)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)
  const setHideCompletionScore = useStore((s) => s.setHideCompletionScore)
  const avatarDataUrl = useStore((s) => s.avatarDataUrl)
  const setAvatar = useStore((s) => s.setAvatar)
  const bio = useStore((s) => s.bio)
  const setBio = useStore((s) => s.setBio)

  const score = useMemo(() => computeCompletionScore(CURRENT_USER_ID, prompts), [prompts])
  const received = prompts.filter((p) => p.toUserId === CURRENT_USER_ID && !p.boardId)
  const completed = received.filter((p) => p.status === 'completed').length

  const displayName = account ? (account.firstName ?? account.organizationName ?? account.username) : 'You'
  const handle = account ? `@${account.username}` : '@you'
  const myCalendars = calendars.filter((c) => c.memberIds.includes(CURRENT_USER_ID))

  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    if (account) getMe(account.token).then((res) => setMe(res.ok ? res.data : null))
  }, [account])

  async function handleRealPermission(value: PromptPermission) {
    if (!account) return
    const res = await setMyPromptPermission(value, account.token)
    if (res.ok) setMe((prev) => (prev ? { ...prev, promptPermission: value } : prev))
  }

  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState(bio)
  const [avatarBusy, setAvatarBusy] = useState(false)

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return
    setAvatarBusy(true)
    try {
      setAvatar(await fileToCompressedDataUrl(file, 240, 0.8))
    } finally {
      setAvatarBusy(false)
    }
  }

  function saveBio() {
    setBio(bioDraft.trim())
    setEditingBio(false)
  }

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-xl">
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-ink text-paper">
            <CameraIcon size={12} />
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
          />
        </label>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{displayName}</h1>
          <p className="text-xs text-ink-faint">
            {handle} · {following.length} following · {followers.length} followers
          </p>
          {editingBio ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                placeholder="Tell people what you're about…"
                rows={2}
                maxLength={140}
                className="resize-none rounded-sm border border-line bg-card p-2 text-sm outline-none focus:border-line-strong"
              />
              <div className="flex gap-1.5">
                <button onClick={saveBio} className="rounded-sm bg-ink px-3 py-1 text-xs font-medium text-paper">
                  Save
                </button>
                <button
                  onClick={() => {
                    setBioDraft(bio)
                    setEditingBio(false)
                  }}
                  className="rounded-sm border border-line px-3 py-1 text-xs text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingBio(true)} className="mt-1 text-left text-sm">
              {bio ? <span className="text-ink-soft">{bio}</span> : <span className="text-ink-faint underline underline-offset-2">Add a bio</span>}
            </button>
          )}
        </div>
      </div>
      {avatarBusy && <p className="-mt-4 text-xs text-ink-faint">Updating photo…</p>}
      <Link to={`/u/${CURRENT_USER_ID}`} className="-mt-4 text-xs text-ink-faint underline underline-offset-2">
        Preview how others see your profile
      </Link>

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
          {score === null ? (
            <p className="text-sm italic text-ink-faint">Not available: complete your first prompt!</p>
          ) : (
            <>
              <div>
                <p className="font-serif text-3xl text-accent">{score}%</p>
                <p className="text-xs uppercase tracking-wide text-ink-faint">Completion score</p>
              </div>
              <p className="max-w-[45%] text-right text-xs text-ink-faint">
                {completed} of {received.length} friend prompts completed
              </p>
            </>
          )}
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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Your calendars</p>
          <Link to="/calendars" className="text-xs font-medium text-ink underline underline-offset-2">
            Manage
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          <Link to="/" className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
            <CalendarIcon size={15} className="text-ink-soft" />
            <span className="text-sm">All Activity</span>
            <span className="ml-auto text-xs text-ink-faint">Default</span>
          </Link>
          {myCalendars.map((c) => (
            <Link key={c.id} to={`/calendars/${c.id}`} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
              {c.visibility === 'private' ? (
                <LockIcon size={14} className="text-ink-soft" />
              ) : (
                <CalendarIcon size={15} className="text-ink-soft" />
              )}
              <span className="text-sm">{c.name}</span>
              <span className="ml-auto text-xs text-ink-faint">{c.ownerId === CURRENT_USER_ID ? 'Owner' : 'Joined'}</span>
            </Link>
          ))}
          <Link
            to="/calendars/new"
            className="rounded-sm border border-dashed border-line-strong px-3 py-2 text-center text-sm text-ink-faint"
          >
            + New calendar
          </Link>
        </div>
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

      <section className="border-t border-line pt-4">
        {confirmingSignOut ? (
          <div className="rounded-sm border border-danger/40 bg-danger/5 p-3">
            <p className="text-sm text-ink">
              Sign out and reset this device? This clears everything in the calendar/feed/boards demo above — it's
              local to this device, not saved to an account.
              {account && ' Your real account itself is unaffected; you can log back into it from any device.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSignOut} className="flex-1 rounded-sm bg-danger py-2 text-sm font-medium text-paper">
                Yes, sign out
              </button>
              <button
                onClick={() => setConfirmingSignOut(false)}
                className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmingSignOut(true)} className="text-sm text-ink-faint underline underline-offset-2">
            Sign out
          </button>
        )}
      </section>
    </div>
  )
}
