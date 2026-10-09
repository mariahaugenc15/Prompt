import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTimeOfDayPhase } from '../lib/useTimeOfDayPhase'

// A faint line-work scene behind every screen that shifts with the time of
// day — sunrise in the morning, sun and trees at midday, moon and clouds at
// night — using the same stroke-only style as Icons.tsx so it reads as part
// of the same hand-drawn language rather than decoration bolted on. Each
// scene's elements carry their own very light tint (warm gold/green by day,
// blue/purple by night) rather than a single flat ink color, since a
// same-color sun-and-horizon read as an ambiguous smudge rather than an
// actual sun and horizon. Opacity stays well short of full strength so it
// never competes with text sitting on top of it.
export function AmbientBackground() {
  const phase = useTimeOfDayPhase()
  const reduceMotion = useReducedMotion()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.22]" aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.svg
          key={phase}
          className="absolute bottom-0 left-0 h-full w-full"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMax slice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.5, ease: 'easeInOut' }}
          fill="none"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {phase === 'morning' && <MorningScene reduceMotion={!!reduceMotion} />}
          {phase === 'midday' && <MiddaySceneContent reduceMotion={!!reduceMotion} />}
          {phase === 'night' && <NightScene reduceMotion={!!reduceMotion} />}
        </motion.svg>
      </AnimatePresence>
    </div>
  )
}

const SUNRISE = '#dba05f'
const SUN = '#e3b94f'
const FOLIAGE = '#89ae76'
const MOON = '#8e9bd6'
const CLOUD = '#a98fcf'

function MorningScene({ reduceMotion }: { reduceMotion: boolean }) {
  const rays = [0, 1, 2, 3, 4]
  return (
    <g>
      <path d="M0 620 Q200 560 400 620" stroke={SUNRISE} />
      <motion.g
        stroke={SUNRISE}
        animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M80 620 A120 120 0 0 1 320 620" />
        {rays.map((i) => {
          const angle = Math.PI - (i / (rays.length - 1)) * Math.PI
          const x1 = 200 + Math.cos(angle) * 130
          const y1 = 620 - Math.sin(angle) * 130
          const x2 = 200 + Math.cos(angle) * 160
          const y2 = 620 - Math.sin(angle) * 160
          return (
            <motion.line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 6, repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
            />
          )
        })}
      </motion.g>
    </g>
  )
}

function MiddaySceneContent({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <g>
      <motion.g
        stroke={SUN}
        animate={reduceMotion ? undefined : { rotate: [0, 8, 0] }}
        style={{ transformOrigin: '320px 140px' }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="320" cy="140" r="38" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180
          return (
            <line
              key={deg}
              x1={320 + Math.cos(rad) * 50}
              y1={140 + Math.sin(rad) * 50}
              x2={320 + Math.cos(rad) * 64}
              y2={140 + Math.sin(rad) * 64}
            />
          )
        })}
      </motion.g>
      <path d="M0 700 Q200 670 400 700" stroke={FOLIAGE} />
      <Tree x={60} scale={1} reduceMotion={reduceMotion} delay={0} />
      <Tree x={150} scale={0.75} reduceMotion={reduceMotion} delay={1.2} />
      <Tree x={340} scale={0.9} reduceMotion={reduceMotion} delay={0.6} />
    </g>
  )
}

function Tree({ x, scale, reduceMotion, delay }: { x: number; scale: number; reduceMotion: boolean; delay: number }) {
  return (
    <motion.g
      stroke={FOLIAGE}
      transform={`translate(${x} 700) scale(${scale})`}
      animate={reduceMotion ? undefined : { rotate: [-2, 2, -2] }}
      style={{ transformOrigin: `${x}px 700px` }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      <path d="M0 0V-70" />
      <path d="M0 -70c-26 0-40-16-40-34 0-18 16-30 32-26-2-20 14-36 32-32 16-4 32 10 30 28 16-2 28 10 28 26 0 18-18 36-42 36Z" />
    </motion.g>
  )
}

function NightScene({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <g>
      <g stroke={MOON}>
        <path d="M250 110a46 46 0 1 0 0 92 58 58 0 1 1 0-92Z" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.circle
            key={i}
            cx={30 + ((i * 67) % 340)}
            cy={40 + ((i * 113) % 260)}
            r={1.6}
            fill={MOON}
            stroke="none"
            animate={reduceMotion ? undefined : { opacity: [0.15, 0.9, 0.15] }}
            transition={{ duration: 4 + i, repeat: Infinity, delay: i * 0.6, ease: 'easeInOut' }}
          />
        ))}
      </g>
      <motion.path
        d="M20 340q30-24 64-8q20-20 48-6q24-14 50 4q30-10 54 10"
        stroke={CLOUD}
        animate={reduceMotion ? undefined : { x: [0, 30, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M160 420q26-20 56-6q18-18 42-4q22-12 44 4"
        stroke={CLOUD}
        animate={reduceMotion ? undefined : { x: [0, -24, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </g>
  )
}
