import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarGrid } from '../components/CalendarGrid'
import { PromptLogo } from '../components/PromptLogo'

export function LoginFlip() {
  const [flipping, setFlipping] = useState(false)
  const navigate = useNavigate()
  const now = new Date()

  return (
    <div className="flex min-h-screen min-h-dvh flex-col items-center justify-center bg-[#3d3730] p-6">
      <div className="w-full max-w-sm" style={{ perspective: 1600 }}>
        <div className="relative aspect-[3/4] w-full">
          {/* the page underneath — today's calendar, already open */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-md border border-line bg-card p-5 shadow-note">
            <div>
              <p className="font-serif text-lg text-ink">
                {now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
              <p className="mb-4 text-xs text-ink-faint">Today is already open.</p>
              <CalendarGrid year={now.getFullYear()} month={now.getMonth()} completions={[]} />
            </div>
          </div>

          {/* the cover — flips open on login */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-md border border-[#2b2620] bg-paper-dim p-6 text-center paper-grain"
            style={{ transformOrigin: 'left center', backfaceVisibility: 'hidden' }}
            animate={{ rotateY: flipping ? -100 : 0 }}
            transition={{ duration: 0.35, ease: [0.65, 0, 0.35, 1] }}
          >
            <div>
              <PromptLogo size={44} className="justify-center" />
              <p className="mt-2 text-sm italic text-ink-soft">prompt real life</p>
            </div>
            <button
              onClick={() => {
                // The flip is a quick tactile cue, not something to wait
                // out — the tap has to register as "taking you to sign in"
                // immediately. Fully finishing the rotation before
                // navigating used to hold on a real (if decorative)
                // calendar page for a full second first, which read as
                // landing on the wrong page rather than a ritual.
                setFlipping(true)
                navigate('/login')
              }}
              className="mt-4 rounded-sm border border-ink bg-ink px-6 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Sign in
            </button>
          </motion.div>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-paper-dim/80">
        New here?{' '}
        <Link to="/signup" className="font-medium text-paper underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </div>
  )
}
