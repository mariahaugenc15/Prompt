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
export function useEffectGuard() {
  const seq = useRef(0)
  const alive = useRef(true)

  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )

  return function start() {
    const mySeq = ++seq.current
    return () => alive.current && mySeq === seq.current
  }
}
