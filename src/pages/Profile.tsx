import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { fileToCompressedDataUrl } from '../lib/media'
import { enablePushNotifications, pushSupported } from '../lib/push'
import type { PromptPermission } from '../lib/types'
import { CalendarIcon, CameraIcon, LockIcon, BoardsIcon, ShareIcon, BellIcon } from '../components/Icons'
import { VerifiedBadge } from '../components/VerifiedBadge'
import {
  getMe,
  getProfile,
  getFollowing,
  setMyPromptPermission,
  getCompletionScore,
  getBlockedAccounts,
  unblockAccount,
  updateMyAvatar,
  updateMyBio,
  logout,
  deleteMyAccount,
  getPromptHistory,
  unsendPrompt,
  submitFeedback,
  type Me,
  type PublicProfile,
  type OneToOneHistoryItem,
} from '../lib/realAccountsApi'
import { getMyCalendars, type RealCalendar } from '../lib/calendarsApi'
import { getMyBoards, type RealBoard } from '../lib/boardsApi'
import { startTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor } from '../lib/twoFactorApi'
import {
  getVerificationStatus,
  requestVerification,
  type VerificationCategory,
  type VerificationStatus as VerificationStatusData,
} from '../lib/verificationApi'

export function Profile() {
  const navigate = useNavigate()
  const signOut = useStore((s) => s.signOut)
  const account = useStore((s) => s.account)
  const hideCompletionScore = useStore((s) => s.hideCompletionScore)
  const setHideCompletionScore = useStore((s) => s.setHideCompletionScore)

  const displayName = account ? (account.firstName ?? account.organizationName ?? account.username) : 'You'
  const handle = account ? `@${account.username}` : '@you'

  const [me, setMe] = useState<Me | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [followingList, setFollowingList] = useState<PublicProfile[]>([])
  const [blockedList, setBlockedList] = useState<PublicProfile[]>([])
  const [myCalendars, setMyCalendars] = useState<RealCalendar[]>([])
  const [myBoards, setMyBoards] = useState<RealBoard[]>([])
  const [score, setScore] = useState<{ score: number | null; completed: number; total: number } | null>(null)
  const [sentPending, setSentPending] = useState<OneToOneHistoryItem[]>([])
  const [unsendingId, setUnsendingId] = useState<string | null>(null)

  function refreshProfile() {
    if (!account) return
    getProfile(account.username, account.token).then((res) => setProfile(res.ok ? res.data : null))
  }

  function refreshSent() {
    if (!account) return
    getPromptHistory(account.token).then((res) => {
      if (!res.ok) return
      setSentPending(res.data.oneToOne.filter((p) => p.senderUsername === account.username && p.status === 'pending'))
    })
  }

  useEffect(() => {
    if (!account) return
    getMe(account.token).then((res) => setMe(res.ok ? res.data : null))
    refreshProfile()
    refreshSent()
    getFollowing(account.username, account.token).then((res) => setFollowingList(res.ok ? res.data : []))
    getBlockedAccounts(account.token).then((res) => setBlockedList(res.ok ? res.data : []))
    getMyCalendars(account.token).then((res) => setMyCalendars(res.ok ? res.data : []))
    getMyBoards(account.token).then((res) => setMyBoards(res.ok ? res.data : []))
    getCompletionScore(account.token).then((res) => setScore(res.ok ? res.data : null))
  }, [account])

  async function handleUnsend(id: string) {
    if (!account) return
    setUnsendingId(id)
    try {
      const res = await unsendPrompt(id, account.token)
      if (res.ok) setSentPending((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setUnsendingId(null)
    }
  }

  async function handleRealPermission(value: PromptPermission) {
    if (!account) return
    const res = await setMyPromptPermission(value, account.token)
    if (res.ok) setMe((prev) => (prev ? { ...prev, promptPermission: value } : prev))
  }

  async function handleUnblock(username: string) {
    if (!account) return
    const res = await unblockAccount(username, account.token)
    if (res.ok) setBlockedList((prev) => prev.filter((p) => p.username !== username))
  }

  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [bioSaving, setBioSaving] = useState(false)

  useEffect(() => {
    setBioDraft(profile?.bio ?? '')
  }, [profile?.bio])

  async function handleAvatarFile(file: File | undefined) {
    if (!file || !account) return
    setAvatarBusy(true)
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 240, 0.8)
      const res = await updateMyAvatar(dataUrl, account.token)
      if (res.ok) setProfile((prev) => (prev ? { ...prev, avatarUrl: res.data.avatarUrl } : prev))
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveBio() {
    if (!account) return
    setBioSaving(true)
    try {
      const res = await updateMyBio(bioDraft.trim(), account.token)
      if (res.ok) setProfile((prev) => (prev ? { ...prev, bio: res.data.bio } : prev))
      setEditingBio(false)
    } finally {
      setBioSaving(false)
    }
  }

  const [inviteCopied, setInviteCopied] = useState(false)
  const inviteUrl = `${window.location.origin}/invite`

  async function handleInvite() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Prompt', text: 'prompt real life', url: inviteUrl })
        return
      } catch {
        // user cancelled the share sheet — fall through to copy instead
      }
    }
    await navigator.clipboard.writeText(inviteUrl)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  const [notifStatus, setNotifStatus] = useState<'idle' | 'busy' | 'on' | 'denied' | 'unsupported'>(() =>
    pushSupported() ? (Notification.permission === 'granted' ? 'on' : 'idle') : 'unsupported',
  )

  async function handleEnableNotifications() {
    if (!account) return
    setNotifStatus('busy')
    const result = await enablePushNotifications(account.token)
    setNotifStatus(result === 'subscribed' ? 'on' : result === 'denied' ? 'denied' : result === 'unsupported' ? 'unsupported' : 'idle')
  }

  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  async function handleSendFeedback() {
    if (!account || !feedbackText.trim()) return
    setFeedbackSending(true)
    try {
      const res = await submitFeedback(feedbackText.trim(), account.token)
      if (res.ok) {
        setFeedbackText('')
        setFeedbackSent(true)
        setTimeout(() => setFeedbackSent(false), 3000)
      }
    } finally {
      setFeedbackSending(false)
    }
  }

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSignOut() {
    if (account) await logout(account.token)
    signOut()
    navigate('/')
  }

  async function handleDeleteAccount() {
    if (!account) return
    setDeleting(true)
    try {
      await deleteMyAccount(account.token)
      signOut()
      navigate('/')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-paper-dim font-serif text-xl">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
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
          <h1 className="flex items-center gap-1.5 font-serif text-xl leading-tight">
            {displayName}
            {me?.isVerified && <VerifiedBadge size={15} />}
          </h1>
          <p className="text-xs text-ink-faint">
            {handle} · {profile?.followingCount ?? 0} following · {profile?.followerCount ?? 0} followers
          </p>
          {editingBio ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                placeholder="Tell people what you're about…"
                rows={2}
                maxLength={280}
                className="resize-none rounded-sm border border-line bg-card p-2 text-sm outline-none focus:border-line-strong"
              />
              <div className="flex gap-1.5">
                <button onClick={saveBio} disabled={bioSaving} className="rounded-sm bg-ink px-3 py-1 text-xs font-medium text-paper disabled:opacity-50">
                  {bioSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setBioDraft(profile?.bio ?? '')
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
              {profile?.bio ? (
                <span className="text-ink-soft">{profile.bio}</span>
              ) : (
                <span className="text-ink-faint underline underline-offset-2">Add a bio</span>
              )}
            </button>
          )}
        </div>
      </div>
      {avatarBusy && <p className="-mt-4 text-xs text-ink-faint">Updating photo…</p>}
      {account && (
        <Link to={`/o/${account.username}`} className="-mt-4 text-xs text-ink-faint underline underline-offset-2">
          View your public profile — what other users see when they find you
        </Link>
      )}

      <button
        onClick={handleInvite}
        className="flex items-center gap-3 rounded-sm border border-dashed border-accent/50 bg-accent-soft/40 p-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-card text-accent">
          <ShareIcon size={15} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">Invite friends to Prompt</span>
          <span className="block text-xs text-ink-faint">prompt real life — share the link</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-accent">{inviteCopied ? 'Copied!' : 'Share'}</span>
      </button>

      {notifStatus !== 'unsupported' && (
        <button
          onClick={handleEnableNotifications}
          disabled={notifStatus === 'busy' || notifStatus === 'on'}
          className="flex items-center gap-3 rounded-sm border border-line bg-card p-3 text-left disabled:opacity-70"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-dim text-ink-soft">
            <BellIcon size={15} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">
              {notifStatus === 'on' ? 'Notifications enabled' : 'Enable notifications'}
            </span>
            <span className="block text-xs text-ink-faint">
              {notifStatus === 'denied'
                ? 'Blocked in your browser settings — enable them there to turn this on.'
                : "Get notified when someone prompts you, even when the app's closed."}
            </span>
          </span>
        </button>
      )}

      {account && me && (
        <section className="rounded-sm border border-line bg-card p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">
            Account — @{me.username} ({me.accountType})
          </p>
          <Link to={`/o/${me.username}`} className="block rounded-sm border border-ink py-2 text-center text-sm font-medium">
            My page
          </Link>
          {me.accountType === 'individual' && (
            <Link
              to="/real/send"
              className="mt-2 block rounded-sm border border-line py-2 text-center text-sm text-ink-soft"
            >
              Send to a username
            </Link>
          )}
          {me.accountType === 'individual' && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-xs text-ink-faint">Who can send @{me.username} a prompt</p>
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

      {account && me && (
        <SecuritySection
          token={account.token}
          totpEnabled={me.totpEnabled}
          onChange={(enabled) => setMe((prev) => (prev ? { ...prev, totpEnabled: enabled, isVerified: enabled ? prev.isVerified : false } : prev))}
        />
      )}

      {account && me && <VerificationSection token={account.token} isVerified={me.isVerified} totpEnabled={me.totpEnabled} />}

      {sentPending.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Sent, awaiting response</p>
          <div className="flex flex-col gap-1.5">
            {sentPending.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{p.promptText}</p>
                  <p className="text-xs text-ink-faint">To @{p.recipientUsername}</p>
                </div>
                <button
                  onClick={() => handleUnsend(p.id)}
                  disabled={unsendingId === p.id}
                  className="shrink-0 text-xs text-ink-faint underline underline-offset-2 disabled:opacity-50"
                >
                  {unsendingId === p.id ? 'Unsending…' : 'Unsend'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-sm border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          {!score || score.score === null ? (
            <p className="text-sm italic text-ink-faint">Not available: complete your first prompt!</p>
          ) : (
            <>
              <div>
                <p className="font-serif text-3xl text-accent">{score.score}%</p>
                <p className="text-xs uppercase tracking-wide text-ink-faint">Completion score</p>
              </div>
              <p className="max-w-[45%] text-right text-xs text-ink-faint">
                {score.completed} of {score.total} friend prompts completed
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
              <span className="ml-auto text-xs text-ink-faint">{c.isOwner ? 'Owner' : 'Joined'}</span>
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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Your boards</p>
          <Link to="/boards" className="text-xs font-medium text-ink underline underline-offset-2">
            Manage
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          {myBoards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
              {b.icon ? (
                <span className="text-sm">{b.icon}</span>
              ) : b.visibility === 'invite' ? (
                <LockIcon size={14} className="text-ink-soft" />
              ) : (
                <BoardsIcon size={15} className="text-ink-soft" />
              )}
              <span className="text-sm">{b.name}</span>
              <span className="ml-auto text-xs text-ink-faint">{b.isOwner ? 'Owner' : 'Joined'}</span>
            </Link>
          ))}
          <Link
            to="/boards/new"
            className="rounded-sm border border-dashed border-line-strong px-3 py-2 text-center text-sm text-ink-faint"
          >
            + New board
          </Link>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Following</p>
        {followingList.length === 0 ? (
          <p className="text-sm text-ink-faint">You're not following anyone yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {followingList.map((p) => (
              <Link key={p.id} to={`/o/${p.username}`} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-line bg-paper-dim font-serif text-sm">
                  {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : p.displayName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium leading-tight">{p.displayName}</p>
                  <p className="text-xs text-ink-faint">@{p.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {blockedList.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Blocked accounts</p>
          <div className="flex flex-col gap-1.5">
            {blockedList.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-sm border border-line bg-card px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                  {p.displayName.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium leading-tight">{p.displayName}</p>
                  <p className="text-xs text-ink-faint">@{p.username}</p>
                </div>
                <button onClick={() => handleUnblock(p.username)} className="shrink-0 text-xs text-ink-faint underline underline-offset-2">
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-sm border border-line bg-card p-4">
        <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Send feedback</p>
        <p className="mb-2 text-xs text-ink-faint">Bugs, ideas, anything — this goes straight to the people running Prompt.</p>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What's on your mind?"
          className="w-full resize-none rounded-sm border border-line bg-paper p-2.5 text-sm outline-none focus:border-line-strong"
        />
        <button
          onClick={handleSendFeedback}
          disabled={!feedbackText.trim() || feedbackSending}
          className="mt-2 w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
        >
          {feedbackSending ? 'Sending…' : feedbackSent ? 'Sent — thank you!' : 'Send feedback'}
        </button>
      </section>

      <section className="border-t border-line pt-4">
        <Link to="/terms" className="mr-3 text-xs text-ink-faint underline underline-offset-2">
          Terms
        </Link>
        <Link to="/privacy" className="text-xs text-ink-faint underline underline-offset-2">
          Privacy
        </Link>
      </section>

      <section>
        {confirmingSignOut ? (
          <div className="rounded-sm border border-danger/40 bg-danger/5 p-3">
            <p className="text-sm text-ink">
              Sign out of this device? Your account, calendars, and boards are all saved to your account and
              unaffected — you can log back in from any device.
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

      <section>
        {confirmingDelete ? (
          <div className="rounded-sm border border-danger/40 bg-danger/5 p-3">
            <p className="text-sm text-ink">
              Delete your account permanently? Your username, email, avatar, and bio are removed and you won't be
              able to log back in. Prompts and completions you were part of stay visible to the people they
              involved, attributed to a deleted account, rather than disappearing from their history.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 rounded-sm bg-danger py-2 text-sm font-medium text-paper disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-sm border border-line py-2 text-sm text-ink-soft"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-sm text-danger/80 underline underline-offset-2">
            Delete account
          </button>
        )}
      </section>
    </div>
  )
}

// Two-factor authentication (TOTP) setup/disable — a prerequisite for
// requesting the verified badge (see VerificationSection below), not just a
// general security option: a verified badge is a bigger prize for an
// account-takeover attempt than an ordinary account, so it's only handed
// out to accounts already hardened against one.
function SecuritySection({
  token,
  totpEnabled,
  onChange,
}: {
  token: string
  totpEnabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const [stage, setStage] = useState<'idle' | 'setup' | 'backupCodes'>('idle')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disabling, setDisabling] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)

  async function handleStartSetup() {
    setError(null)
    setBusy(true)
    try {
      const res = await startTwoFactorSetup(token)
      if (res.ok) {
        setSecret(res.data.secret)
        setStage('setup')
      } else {
        setError(res.errors.form ?? 'Could not start setup.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      const res = await confirmTwoFactorSetup(code.trim(), token)
      if (res.ok) {
        setBackupCodes(res.data.backupCodes)
        setStage('backupCodes')
        setCode('')
        onChange(true)
      } else {
        setError(res.errors.code ?? res.errors.form ?? 'Incorrect code.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setDisableError(null)
    setBusy(true)
    try {
      const res = await disableTwoFactor(disablePassword, token)
      if (res.ok) {
        onChange(false)
        setDisabling(false)
        setDisablePassword('')
        setStage('idle')
      } else {
        setDisableError(res.errors.password ?? res.errors.form ?? 'Could not disable.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'backupCodes') {
    return (
      <section className="rounded-sm border border-line bg-card p-4">
        <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Save your backup codes</p>
        <p className="mb-2 text-xs text-ink-faint">
          Each one works once, if you ever lose access to your authenticator app. They won't be shown again.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-sm bg-paper-dim p-3 font-mono text-xs">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <button onClick={() => setStage('idle')} className="w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper">
          Done
        </button>
      </section>
    )
  }

  return (
    <section className="rounded-sm border border-line bg-card p-4">
      <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Two-factor authentication</p>
      {totpEnabled ? (
        <>
          <p className="mb-2 text-sm text-ink-soft">Enabled — a code from your authenticator app is required to log in.</p>
          {disabling ? (
            <div className="flex flex-col gap-1.5">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Confirm your password"
                className="rounded-sm border border-line bg-paper p-2 text-sm outline-none focus:border-line-strong"
              />
              {disableError && <p className="text-xs text-danger">{disableError}</p>}
              <div className="flex gap-1.5">
                <button
                  onClick={handleDisable}
                  disabled={!disablePassword || busy}
                  className="flex-1 rounded-sm bg-danger py-1.5 text-xs font-medium text-paper disabled:opacity-50"
                >
                  Disable
                </button>
                <button
                  onClick={() => {
                    setDisabling(false)
                    setDisablePassword('')
                    setDisableError(null)
                  }}
                  className="flex-1 rounded-sm border border-line py-1.5 text-xs text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDisabling(true)} className="text-xs text-danger/80 underline underline-offset-2">
              Disable two-factor authentication
            </button>
          )}
        </>
      ) : stage === 'setup' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-faint">
            Add this key to an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit
            code it shows.
          </p>
          <p className="select-all rounded-sm bg-paper-dim p-2 text-center font-mono text-sm tracking-widest">{secret}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            className="rounded-sm border border-line bg-paper p-2 text-center text-sm tracking-widest outline-none focus:border-line-strong"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={handleConfirm}
              disabled={!code.trim() || busy}
              className="flex-1 rounded-sm bg-ink py-1.5 text-xs font-medium text-paper disabled:opacity-50"
            >
              {busy ? 'Confirming…' : 'Confirm'}
            </button>
            <button
              onClick={() => {
                setStage('idle')
                setCode('')
                setError(null)
              }}
              className="flex-1 rounded-sm border border-line py-1.5 text-xs text-ink-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-soft">Not enabled. Turning this on is required to request the verified badge.</p>
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          <button
            onClick={handleStartSetup}
            disabled={busy}
            className="w-full rounded-sm border border-ink py-2 text-sm font-medium disabled:opacity-50"
          >
            Set up two-factor authentication
          </button>
        </>
      )}
    </section>
  )
}

const VERIFICATION_CATEGORIES: { value: VerificationCategory; label: string }[] = [
  { value: 'organization', label: 'Organization' },
  { value: 'public_figure', label: 'Public figure' },
  { value: 'other', label: 'Other' },
]

// Lets an organization or high-profile individual (athlete, creator, etc.)
// ask to be marked verified — reviewed by an admin in the dashboard
// (server/adminRoutes.ts's /api/admin/verification-requests), not granted
// automatically.
function VerificationSection({
  token,
  isVerified,
  totpEnabled,
}: {
  token: string
  isVerified: boolean
  totpEnabled: boolean
}) {
  const [status, setStatus] = useState<VerificationStatusData | null>(null)
  const [category, setCategory] = useState<VerificationCategory>('organization')
  const [links, setLinks] = useState('')
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    getVerificationStatus(token).then((res) => setStatus(res.ok ? res.data : null))
  }, [token])

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await requestVerification({ category, links: links.trim(), explanation: explanation.trim() }, token)
      if (res.ok) {
        setSubmitted(true)
        setLinks('')
        setExplanation('')
      } else {
        setError(res.errors.form ?? res.errors.category ?? res.errors.links ?? res.errors.explanation ?? 'Could not submit request.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isVerified) {
    return (
      <section className="rounded-sm border border-line bg-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <VerifiedBadge size={14} /> Verified
        </p>
        <p className="mt-1 text-xs text-ink-faint">This account has been reviewed and confirmed by Prompt.</p>
      </section>
    )
  }

  const pending = status?.latestRequest?.status === 'pending'
  const rejected = status?.latestRequest?.status === 'rejected'

  if (submitted || pending) {
    return (
      <section className="rounded-sm border border-line bg-card p-4">
        <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Get verified</p>
        <p className="text-sm text-ink-soft">Your request is in review — we'll follow up by email.</p>
      </section>
    )
  }

  return (
    <section className="rounded-sm border border-line bg-card p-4">
      <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Get verified</p>
      <p className="mb-2 text-xs text-ink-faint">
        For organizations and high-profile individuals (athletes, creators, public figures) — a reviewed badge so
        people know who they're actually following.
      </p>
      {!totpEnabled ? (
        <p className="rounded-sm bg-paper-dim p-2 text-xs text-ink-soft">
          Turn on two-factor authentication above before requesting verification.
        </p>
      ) : (
        <>
          {rejected && (
            <p className="mb-2 rounded-sm bg-danger/5 p-2 text-xs text-ink-soft">
              Your last request wasn't approved{status?.latestRequest?.reviewNote ? `: ${status.latestRequest.reviewNote}` : '.'}{' '}
              You can submit a new one below.
            </p>
          )}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {VERIFICATION_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs',
                  category === c.value ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Links that help confirm who you are (official site, verified social profile, press, etc.)"
            className="mb-2 w-full resize-none rounded-sm border border-line bg-paper p-2 text-sm outline-none focus:border-line-strong"
          />
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Why should this account be verified?"
            className="mb-2 w-full resize-none rounded-sm border border-line bg-paper p-2 text-sm outline-none focus:border-line-strong"
          />
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!links.trim() || !explanation.trim() || submitting}
            className="w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
          >
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </>
      )}
    </section>
  )
}
