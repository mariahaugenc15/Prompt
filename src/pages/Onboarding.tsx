import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import { IndexCard } from '../components/IndexCard'
import { CheckIcon } from '../components/Icons'

export function Onboarding() {
  const users = useStore((s) => s.users)
  const boards = useStore((s) => s.boards)
  const following = useStore((s) => s.following)
  const followUser = useStore((s) => s.followUser)
  const joinBoard = useStore((s) => s.joinBoard)
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const [joined, setJoined] = useState<Set<string>>(new Set())

  const starterBoard = boards[0]
  const canFinish = following.length > 0 || joined.size > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="mx-auto flex min-h-screen min-h-dvh max-w-sm flex-col justify-center gap-6 p-6"
    >
      <div className="text-center">
        <h1 className="font-serif text-2xl text-ink">Your calendar is empty.</h1>
        <p className="mt-1 text-sm text-ink-soft">That's the point — every day starts blank. Let's line up your first dare.</p>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Add a friend</p>
        <div className="flex flex-col gap-2">
          {users.slice(0, 3).map((u) => {
            const isFollowing = following.includes(u.id)
            return (
              <IndexCard key={u.id} className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                    {u.initial}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{u.name}</p>
                    <p className="text-xs text-ink-faint">{u.handle}</p>
                  </div>
                </div>
                <button
                  onClick={() => followUser(u.id)}
                  disabled={isFollowing}
                  className="rounded-sm border border-ink px-3 py-1 text-xs font-medium disabled:border-line disabled:text-ink-faint"
                >
                  {isFollowing ? <CheckIcon size={14} /> : 'Follow'}
                </button>
              </IndexCard>
            )
          })}
        </div>
      </div>

      {starterBoard && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Or subscribe to a starter board</p>
          <IndexCard className="p-3">
            <p className="font-serif text-base">{starterBoard.name}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{starterBoard.description}</p>
            <button
              onClick={() => {
                joinBoard(starterBoard.id)
                setJoined(new Set(joined).add(starterBoard.id))
              }}
              disabled={joined.has(starterBoard.id)}
              className="mt-2.5 rounded-sm border border-ink px-3 py-1 text-xs font-medium disabled:border-line disabled:text-ink-faint"
            >
              {joined.has(starterBoard.id) ? 'Subscribed' : 'Subscribe'}
            </button>
          </IndexCard>
        </div>
      )}

      <button
        onClick={completeOnboarding}
        disabled={!canFinish}
        className="mt-2 rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper transition disabled:bg-line disabled:text-ink-faint"
      >
        Go to my calendar
      </button>
    </motion.div>
  )
}
