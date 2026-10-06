import { motion, useReducedMotion } from 'framer-motion'

// One branded loading mark used everywhere the app would otherwise show a
// generic spinner or bare "Loading…" text — a line-work leaf (matches
// Icons.tsx's LeafIcon) that turns slowly, standing in for a spinner without
// breaking the hand-drawn visual language. Sits still under
// prefers-reduced-motion rather than spinning.
export function LoadingMark({ size = 18, label = 'Loading' }: { size?: number; label?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <span className="inline-flex items-center gap-2 text-ink-faint" role="status" aria-label={label}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
      >
        <path d="M20 4c-9 0-16 6-16 16 10 0 16-7 16-16Z" />
        <path d="M5 19c3-4 6-7 12-11" />
      </motion.svg>
      <span className="text-sm">{label}…</span>
    </span>
  )
}
