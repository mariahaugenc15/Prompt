import { useEffect } from 'react'
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

  useEffect(() => {
    if (userId === CURRENT_USER_ID) navigate('/profile', { replace: true })
  }, [userId, navigate])

  if (userId === CURRENT_USER_ID) return null

  const user = users.find((u) => u.id === userId)
  if (!user) {
    return (
      <div className="p-6 text-center text-sm text-ink-faint">
        No profile found.
        <button onClick={() => navigate('/feed')} className="mt-2 block underline">
          Back to feed
        </button>
      </div>
    )
  }

  const theirSubmissions = submissions.filter((s) => s.userId === user.id).sort((a, b) => b.createdAt - a.createdAt)
  const isFollowing = following.includes(user.id)
  const followsYou = followers.includes(user.id)

  return (
    <div className="flex flex-col gap-5 p-4">
      <button onClick={() => navigate(-1)} className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <CloseIcon size={13} /> Close
      </button>

      <div className="flex items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-xl">
          {user.initial}
        </span>
        <div className="flex-1">
          <h1 className="font-serif text-xl leading-tight">{user.name}</h1>
          <p className="text-xs text-ink-faint">
            {user.handle}
            {followsYou && ' · Follows you'}
          </p>
        </div>
        <button
          onClick={() => (isFollowing ? unfollowUser(user.id) : followUser(user.id))}
          className={
            isFollowing
              ? 'rounded-sm border border-line px-3 py-1.5 text-sm text-ink-soft'
              : 'rounded-sm border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-paper'
          }
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
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
