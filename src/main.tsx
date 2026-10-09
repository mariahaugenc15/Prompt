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
// someone thinks to force-quit and relaunch it. Reloading once, the
// moment a new service worker actually takes control, keeps a running
// app from ever being stuck on old code for more than a few seconds.
//
// "controllerchange" also fires the very first time any service worker
// ever takes control of a page that loaded with none — i.e. a fresh
// install's first launch, not an update replacing an already-running
// version. Reloading then (mid-login, mid-signup, whatever the user
// happens to be doing seconds after first opening the app) silently
// wipes their in-progress session, not something that needs fixing.
// hadController distinguishes the two: only reload when this page was
// already under some service worker's control to begin with.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
