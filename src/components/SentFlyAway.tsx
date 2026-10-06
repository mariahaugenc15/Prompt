import { motion, useReducedMotion } from 'framer-motion'

const DURATION = 2

// A slower, more deliberate "write it, fold it, peel it off the fridge and
// throw it" gesture on send success: a squiggle draws in as if the note is
// still being written, the card creases as though folding in half, then it
// peels free and arcs off the top-right of the screen, fading as it goes.
// `pointer-events-none` on the overlay keeps this purely decorative — the
// page underneath (e.g. the back link) stays clickable the whole time, and
// unmounting mid-animation (navigating away early) is always safe since
// there's nothing here but a self-contained framer-motion animation.
export function SentFlyAway({ onComplete }: { onComplete: () => void }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.3, 0.7, 1] }}
          onAnimationComplete={onComplete}
          className="rounded-sm border border-line bg-[#fff9e0] px-5 py-3 text-center shadow-note"
        >
          <p className="font-serif text-xl text-ink">Sent!</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ x: 0, y: 0, rotate: 0, rotateX: 0, scale: 1, opacity: 1 }}
        animate={{
          x: [0, 0, 0, -4, 340],
          y: [0, 0, 0, -10, -480],
          rotate: [0, 0, -4, -8, 40],
          rotateX: [0, 55, 0, 0, 0],
          scale: [1, 0.93, 1.04, 1.01, 0.6],
          opacity: [1, 1, 1, 1, 0],
        }}
        transition={{ duration: DURATION, times: [0, 0.22, 0.36, 0.5, 1], ease: [0.34, 0.8, 0.64, 1] }}
        onAnimationComplete={onComplete}
        style={{ transformPerspective: 600 }}
        className="absolute flex h-28 w-40 flex-col items-center justify-center gap-1 rounded-sm border border-line bg-[#fff9e0] p-3 text-center shadow-note"
      >
        <svg width="70" height="20" viewBox="0 0 70 20" className="text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
          <motion.path
            d="M2 14 Q12 4 20 12 T38 10 T56 14 T68 8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: DURATION * 0.2, ease: 'easeInOut' }}
          />
        </svg>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 1, 1, 0] }}
          transition={{ duration: DURATION, times: [0, 0.2, 0.3, 0.5, 0.85, 1] }}
          className="font-serif text-xl text-ink"
        >
          Sent!
        </motion.p>
      </motion.div>
    </div>
  )
}
