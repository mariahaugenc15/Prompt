import { useEffect, useRef } from 'react'

// Guards against a stale-closure race: an effect that fires an async
// fetch and applies the result via setState (keyed on something that can
// genuinely change value, like the signed-in account) has no guarantee
// its response resolves before a newer run's response does. Switching
// from account A to account B quickly enough that A's still-in-flight
// request resolves after B's can let A's response silently overwrite
// state that's supposed to belong to B — "showing the wrong account" is
// exactly what that looks like.
//
// Call start() once at the top of the effect; it returns isCurrent(),
// which stays true only until the effect re-runs (dependencies change)
// or the component unmounts. Guard every setState inside a .then() with
// it: `.then((res) => { if (isCurrent()) setX(res.data) })`. Same
// sequence-number idea SignUp.tsx's checkSeq already uses for the
// debounced username check, generalized into one reusable hook instead
// of re-deriving it ad hoc per page.
//
// IMPORTANT: call useEffectGuard() once PER INDEPENDENT fetching concern,
// not once per component. One instance's start() shares a single counter,
// so calling it from two effects (or an effect plus a helper function it
// invokes) that can both be in flight at once makes the second call
// silently invalidate the first's still-pending isCurrent() — its
// setState calls then get dropped even though nothing about that
// concern actually went stale. A component with, say, a "load the main
// record" effect and a separate "load the sidebar list" effect needs two
// separate useEffectGuard() instances, one per concern, even if both
// happen to fire on the same mount.
export function useEffectGuard() {
  const seq = useRef(0)
  const alive = useRef(true)

  // Reset alive to true on every effect run, not just once at ref
  // creation. React 18 StrictMode deliberately mounts, cleans up, and
  // re-mounts every component once in dev to surface exactly this class
  // of bug: without the reset here, that phantom unmount's cleanup sets
  // alive.current = false and nothing ever sets it back, so isCurrent()
  // returns false forever after — even though the component is still
  // genuinely mounted. The real (final) unmount still wins, since no
  // further effect run follows it to flip alive back on.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  return function start() {
    const mySeq = ++seq.current
    return () => alive.current && mySeq === seq.current
  }
}
