import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// The PWA's service worker (registerType: 'autoUpdate' in vite.config.ts)
// installs and activates a new version in the background on its own, but
// that alone never refreshes an already-open tab — a pinned/standalone
// install can sit on a stale JS bundle indefinitely, silently missing
// fixes (a feature that works server-side just never appears) until
// someone thinks to force-quit and relaunch it.
//
// Reloading the instant "controllerchange" fires is tempting but unsafe:
// that event fires whenever a new service worker takes over, including
// mid-session after an unrelated earlier install/update left one already
// registered — there's no reliable way to tell "this is nothing, ignore
// it" from "this just replaced a stale one" from inside this listener.
// Either way, an immediate reload can land in the middle of whatever the
// user happens to be doing right then (typing a password, mid-submit)
// and silently wipe it. Instead, just remember an update is waiting, and
// only apply it once the app is backgrounded (visibilitychange to
// hidden) — nothing is visibly interrupted either way, since nobody's
// looking at the screen at that moment, and the fresh version is simply
// there the next time they open the app.
if ('serviceWorker' in navigator) {
  let updateWaiting = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updateWaiting = true
  })
  document.addEventListener('visibilitychange', () => {
    if (updateWaiting && document.visibilityState === 'hidden') {
      updateWaiting = false
      window.location.reload()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
