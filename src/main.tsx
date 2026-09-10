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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
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
