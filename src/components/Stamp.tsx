import clsx from 'clsx'
import { CATEGORY_ICON } from './Icons'
import type { Category } from '../lib/types'

// A hand-stamped mark never lands perfectly straight or perfectly round —
// feTurbulence/feDisplacementMap roughens the circular border into
// something closer to an actual ink impression, and the rotation below
// gives each one its own small, fixed tilt. Rendered once, near the
// document root (see App.tsx), and referenced by every <Stamp> via
// filter: url(#ink-stamp-texture) rather than each defining its own copy.
export function StampSvgFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id="ink-stamp-texture" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
        </filter>
      </defs>
    </svg>
  )
}

// Deterministic rather than random so the same completion's stamp always
// renders with the same tilt (a page re-render, or the exact same day
// viewed later, shouldn't make it visibly jitter to a different angle).
function tiltFor(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return (Math.abs(hash) % 13) - 6 // -6..6 degrees
}

export function Stamp({
  category,
  seed,
  size = 14,
  locked = false,
  reduceMotion = false,
  className,
}: {
  category: Category
  seed: string
  size?: number
  locked?: boolean
  reduceMotion?: boolean
  className?: string
}) {
  const tilt = reduceMotion ? 0 : tiltFor(seed)
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border-2',
        locked ? 'border-ink-faint/25 text-ink-faint/25' : 'border-accent/70 text-ink/80',
        className,
      )}
      style={{
        width: size * 1.9,
        height: size * 1.9,
        transform: `rotate(${tilt}deg)`,
        filter: locked ? undefined : 'url(#ink-stamp-texture)',
        borderRadius: '48% 52% 49% 51% / 51% 48% 52% 49%',
      }}
    >
      <CATEGORY_ICON category={category} size={size} />
    </span>
  )
}
