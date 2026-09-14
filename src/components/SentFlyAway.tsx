import { motion } from 'framer-motion'

// A quick "peel off the fridge and throw it" gesture on send success — a
// brief lift/rotate to read as being picked up, then a paper-airplane arc
// off the top-right of the screen, fading out along the way.
export function SentFlyAway({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ x: 0, y: 0, rotate: -3, opacity: 1, scale: 1 }}
        animate={{
          x: [0, -6, 340],
          y: [0, -14, -480],
          rotate: [-3, -10, 42],
          opacity: [1, 1, 0],
          scale: [1, 1.04, 0.6],
        }}
        transition={{ duration: 1.1, times: [0, 0.18, 1], ease: [0.34, 0.8, 0.64, 1] }}
        onAnimationComplete={onComplete}
        className="absolute flex h-28 w-40 flex-col items-center justify-center gap-1 rounded-sm border border-line bg-[#fff9e0] p-3 text-center shadow-note"
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.15, 0.3, 0.7, 1] }}
          className="font-serif text-xl text-ink"
        >
          Sent!
        </motion.p>
      </motion.div>
    </div>
  )
}
