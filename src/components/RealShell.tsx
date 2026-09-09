import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'

// Wraps the real, server-backed account pages (org page, real inbox, real
// send) — these aren't gated by the mock app's loggedIn/onboarded flags,
// so they don't use the mock Shell/BottomNav either. Same header for
// cohesive branding, no bottom tabs since those are mock-app-specific.
export function RealShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-paper">
      <AppHeader />
      <div className="flex-1 pb-8">{children}</div>
    </div>
  )
}
