import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BoardsIcon } from '../components/Icons'
import { PromptLogo } from '../components/PromptLogo'
import { FollowListModal } from '../components/FollowListModal'
import {
  follow,
  getFollowers,
  getFollowing,
  getOrganizationBroadcasts,
  getProfile,
  sendBroadcast,
  unfollow,
  type BroadcastSummary,
  type PublicProfile,
} from '../lib/realAccountsApi'

export function OrgPage() {
  const { username = '' } = useParams()
  const account = useStore((s) => s.account)
  const navigate = useNavigate()

  const [profile, setProfile] = useState<PublicProfile | null | 'not-found'>(null)
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>([])
  const [busy, setBusy] = useState(false)

  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [postError, setPostError] = useState<string | null>(null)

  const [listOpen, setListOpen] = useState<'followers' | 'following' | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listProfiles, setListProfiles] = useState<PublicProfile[]>([])

  const isOwner = account?.accountType === 'organization' && account.username === username
  const isSelf = account?.username === username

  function refresh() {
    getProfile(username, account?.token).then((res) => setProfile(res.ok ? res.data : 'not-found'))
    getOrganizationBroadcasts(username).then((res) => setBroadcasts(res.ok ? res.data : []))
  }

  useEffect(refresh, [username, account?.token])
  useEffect(() => setListOpen(null), [username])

  function openList(which: 'followers' | 'following') {
    setListOpen(which)
    setListLoading(true)
    const fetcher = which === 'followers' ? getFollowers : getFollowing
    fetcher(username, account?.token).then((res) => {
      setListProfiles(res.ok ? res.data : [])
      setListLoading(false)
    })
  }

  if (profile === 'not-found') {
    return <p className="p-6 text-center text-sm text-ink-faint">No account found at @{username}.</p>
  }

  async function handleFollowToggle() {
    if (!account || profile === null || profile === 'not-found') return
    setBusy(true)
    try {
      const res = profile.isFollowing ? await unfollow(username, account.token) : await follow(username, account.token)
      if (res.ok) setProfile(res.data)
    } finally {
      setBusy(false)
    }
  }

  async function handleBroadcast() {
    if (!account) return
    setPostError(null)
    const res = await sendBroadcast({ category, text: text.trim() }, account.token)
    if (!res.ok) {
      setPostError(res.errors.form ?? res.errors.text ?? 'Could not post that.')
      return
    }
    setText('')
    refresh()
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-paper-dim text-ink-soft">
          <BoardsIcon size={22} />
        </span>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{profile === null ? '…' : profile.displayName}</h1>
          <p className="text-xs text-ink-faint">@{username}</p>
          {profile && (
            <div className="mt-0.5 flex gap-3 text-xs">
              <button onClick={() => openList('followers')} className="text-ink-soft underline underline-offset-2">
                {profile.followerCount} followers
              </button>
              <button onClick={() => openList('following')} className="text-ink-soft underline underline-offset-2">
                {profile.followingCount} following
              </button>
            </div>
          )}
          {profile && profile.websiteUrl && (
            <a
              href={profile.websiteUrl.startsWith('http') ? profile.websiteUrl : `https://${profile.websiteUrl}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent underline"
            >
              {profile.websiteUrl}
            </a>
          )}
        </div>
      </div>

      {!isSelf && account?.accountType === 'individual' && profile && (
        <div className="flex gap-2">
          <button
            onClick={handleFollowToggle}
            disabled={busy}
            className={clsx(
              'rounded-sm border px-4 py-2 text-sm font-medium',
              profile.isFollowing ? 'border-line text-ink-soft' : 'border-ink bg-ink text-paper',
            )}
          >
            {profile.isFollowing ? 'Following' : 'Follow'}
          </button>
          {profile.accountType === 'individual' && (
            <Link
              to={`/real/send?to=${encodeURIComponent(username)}`}
              className="rounded-sm border border-line px-4 py-2 text-sm text-ink-soft"
            >
              Send a prompt
            </Link>
          )}
        </div>
      )}
      {!account && (
        <p className="text-xs text-ink-faint">
          <Link to="/signup" className="underline">
            Sign up
          </Link>{' '}
          to follow this page and receive its broadcasts.
        </p>
      )}

      {isOwner && (
        <section className="rounded-sm border border-line bg-card p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Broadcast a challenge to your followers</p>
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
            placeholder="What should followers do?"
            className="mb-2 w-full resize-none rounded-sm border border-line bg-paper p-2 text-base outline-none focus:border-line-strong"
          />
          {postError && <p className="mb-2 text-xs text-danger">{postError}</p>}
          <button
            onClick={handleBroadcast}
            disabled={!text.trim()}
            className="w-full rounded-sm bg-ink py-2 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
          >
            Broadcast to followers
          </button>
        </section>
      )}

      {profile && profile.accountType === 'organization' && (
      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Broadcasts &amp; submissions</p>
        {broadcasts.length === 0 && <p className="text-sm text-ink-faint">Nothing broadcast yet.</p>}
        <div className="flex flex-col gap-3">
          {broadcasts.map((b) => (
            <div key={b.id} className="rounded-sm border border-line bg-card p-3">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
                <CATEGORY_ICON category={b.category} size={12} />
                {b.participationCount} completed
              </p>
              <p className="mt-1 font-serif text-base">{b.text}</p>
              {b.completions.length > 0 && (
                <div className="mt-2 columns-2 gap-2">
                  {b.completions.map((c) => (
                    <div key={c.id} className="mb-2 break-inside-avoid rounded-sm border border-line bg-paper p-2">
                      {c.mediaDataUrl && c.mediaType === 'video' ? (
                        <video src={c.mediaDataUrl} controls playsInline className="mb-1.5 w-full rounded-sm bg-ink" />
                      ) : c.mediaDataUrl ? (
                        <img src={c.mediaDataUrl} alt="" className="mb-1.5 w-full rounded-sm object-cover" />
                      ) : null}
                      <p className="text-xs italic text-ink-faint">{c.autoCaption}</p>
                      {c.userCaption && <p className="text-xs text-ink">{c.userCaption}</p>}
                      <p className="mt-1 text-[10px] text-ink-faint">@{c.completerUsername}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      )}

      {!isOwner && (
        <button onClick={() => navigate('/')} className="text-center text-xs text-ink-faint underline">
          Back to home
        </button>
      )}

      <div className="mt-4 flex justify-center opacity-60">
        <PromptLogo size={16} />
      </div>

      {listOpen && (
        <FollowListModal
          title={listOpen === 'followers' ? `Followers of @${username}` : `@${username} follows`}
          profiles={listProfiles}
          loading={listLoading}
          onClose={() => setListOpen(null)}
        />
      )}
    </div>
  )
}
