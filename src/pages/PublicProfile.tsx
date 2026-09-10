import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CURRENT_USER_ID } from '../lib/seed'
import { SubmissionCard } from '../components/SubmissionCard'
import { CloseIcon } from '../components/Icons'

export function PublicProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const users = useStore((s) => s.users)
  const submissions = useStore((s) => s.submissions)
  const following = useStore((s) => s.following)
  const followers = useStore((s) => s.followers)
  const followUser = useStore((s) => s.followUser)
  const unfollowUser = useStore((s) => s.unfollowUser)
  const account = useStore((s) => s.account)
  const avatarDataUrl = useStore((s) => s.avatarDataUrl)
  const bio = useStore((s) => s.bio)

  const isSelf = userId === CURRENT_USER_ID
  const seedUser = users.find((u) => u.id === userId)

  if (!isSelf && !seedUser) {
    return (
      <div className="p-6 text-center text-sm text-ink-faint">
        No profile found.
        <button onClick={() => navigate('/feed')} className="mt-2 block underline">
          Back to feed
        </button>
      </div>
    )
  }

  // Self-preview reuses this same page rather than a separate one, so "how
  // others see you" can never silently drift from what a visitor actually
  // sees — same component, same rendering path, just your own data plugged
  // in and the follow button swapped for a "this is you" badge.
  const displayName = isSelf ? (account ? (account.firstName ?? account.organizationName ?? account.username) : 'You') : seedUser!.name
  const handle = isSelf ? (account ? `@${account.username}` : '@you') : seedUser!.handle
  const initial = isSelf ? displayName.charAt(0).toUpperCase() : seedUser!.initial
  const theirSubmissions = submissions
    .filter((s) => s.userId === (isSelf ? CURRENT_USER_ID : seedUser!.id))
    .sort((a, b) => b.createdAt - a.createdAt)
  const isFollowing = !isSelf && following.includes(seedUser!.id)
  const followsYou = !isSelf && followers.includes(seedUser!.id)

  return (
    <div className="flex flex-col gap-5 p-4">
      <button
        onClick={() => (isSelf ? navigate('/profile') : navigate(-1))}
        className="-mb-2 flex items-center gap-1 text-xs text-ink-faint"
      >
        <CloseIcon size={13} /> Close
      </button>

      {isSelf && (
        <p className="-mb-2 rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-ink-soft">
          This is your public profile — what other people see when they visit you.
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-paper-dim font-serif text-xl">
          {isSelf && avatarDataUrl ? <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" /> : initial}
        </span>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{displayName}</h1>
          <p className="text-xs text-ink-faint">
            {handle}
            {followsYou && ' · Follows you'}
          </p>
          {isSelf && bio && <p className="mt-1 text-sm text-ink-soft">{bio}</p>}
        </div>
        {!isSelf && (
          <button
            onClick={() => (isFollowing ? unfollowUser(seedUser!.id) : followUser(seedUser!.id))}
            className={
              isFollowing
                ? 'rounded-sm border border-line px-3 py-1.5 text-sm text-ink-soft'
                : 'rounded-sm border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-paper'
            }
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Activity</p>
        {theirSubmissions.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing completed yet.</p>
        ) : (
          <div className="columns-2 gap-3">
            {theirSubmissions.map((sub) => (
              <SubmissionCard key={sub.id} submission={sub} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
