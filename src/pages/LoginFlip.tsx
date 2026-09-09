import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import { CalendarGrid } from '../components/CalendarGrid'
import { StampIcon } from '../components/Icons'

export function LoginFlip() {
  const [flipping, setFlipping] = useState(false)
  const login = useStore((s) => s.login)
  const prompts = useStore((s) => s.prompts)
  const now = new Date()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#3d3730] p-6">
      <div className="w-full max-w-sm" style={{ perspective: 1600 }}>
        <div className="relative aspect-[3/4] w-full">
          {/* the page underneath — today's calendar, already open */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-md border border-line bg-card p-5 shadow-note">
            <div>
              <p className="font-serif text-lg text-ink">
                {now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
              <p className="mb-4 text-xs text-ink-faint">Today is already open.</p>
              <CalendarGrid year={now.getFullYear()} month={now.getMonth()} prompts={prompts} />
            </div>
          </div>

          {/* the cover — flips open on login */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-md border border-[#2b2620] bg-paper-dim p-6 text-center paper-grain"
            style={{ transformOrigin: 'left center', backfaceVisibility: 'hidden' }}
            animate={{ rotateY: flipping ? -172 : 0 }}
            transition={{ duration: 1.0, ease: [0.65, 0, 0.35, 1] }}
            onAnimationComplete={() => {
              if (flipping) login()
            }}
          >
            <StampIcon size={30} className="text-accent" />
            <div>
              <h1 className="font-serif text-4xl text-ink">Prompt</h1>
              <p className="mt-2 text-sm italic text-ink-soft">Real prompts. Real life.</p>
            </div>
            <button
              onClick={() => setFlipping(true)}
              className="mt-4 rounded-sm border border-ink bg-ink px-6 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Open today's page
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
