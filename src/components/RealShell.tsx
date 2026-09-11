import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'

// Wraps pages reachable without being logged in (a shared profile link,
// sending a prompt) — unlike Shell, it isn't behind the Protected/login
// gate, since a public profile has to render for a logged-out visitor too.
export function RealShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-xl flex-col bg-paper">
      <AppHeader />
      <div className="flex-1 pb-4">{children}</div>
      <BottomNav />
    </div>
  )
}
