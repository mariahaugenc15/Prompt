import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Stamp } from './Stamp'
import { useStore } from '../lib/store'
import { playStampThud } from '../lib/stampSound'
import { isNativeIOS } from '../lib/widgetBridge'
import type { Category } from '../lib/types'

export interface StampMomentState {
  category: Category
  key: string
}

// The "press, ink bloom, settle" moment a completion earns (Phase 8).
// Both the haptic and the sound are gated by their own settings toggle
// (EditProfile.tsx) per Phase 7's general rule that every sound/haptic
// needs one — @capacitor/haptics' web implementation is already a no-op
// off a real device, but isNativeIOS() keeps it from ever firing
// anything on the browser/PWA build at all, not just silently no-op-ing.
export function StampMoment({ moment, onDone }: { moment: StampMomentState | null; onDone: () => void }) {
  const reduceMotion = Boolean(useReducedMotion())
  const hapticsEnabled = useStore((s) => s.stampHapticsEnabled)
  const soundEnabled = useStore((s) => s.stampSoundEnabled)

  useEffect(() => {
    if (!moment) return
    if (soundEnabled) playStampThud()
    if (hapticsEnabled && isNativeIOS()) {
      void Haptics.impact({ style: ImpactStyle.Medium })
    }
    const timer = window.setTimeout(onDone, reduceMotion ? 700 : 1300)
    return () => window.clearTimeout(timer)
  }, [moment])

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          key={moment.key}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {reduceMotion ? (
            <div className="rounded-full bg-paper/90 p-4 shadow-note">
              <Stamp category={moment.category} seed={moment.key} size={48} reduceMotion />
            </div>
          ) : (
            <>
              <motion.span
                className="absolute rounded-full border-2 border-accent/50"
                initial={{ width: 10, height: 10, opacity: 0.6 }}
                animate={{ width: 160, height: 160, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              <motion.div
                className="rounded-full bg-paper/95 p-5 shadow-note"
                initial={{ scale: 2.2, opacity: 0 }}
                animate={{ scale: [2.2, 0.85, 1], opacity: 1 }}
                transition={{ duration: 0.5, times: [0, 0.6, 1], ease: 'easeOut' }}
              >
                <Stamp category={moment.category} seed={moment.key} size={48} />
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
