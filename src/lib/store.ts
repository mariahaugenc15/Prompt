import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SignupSuccess } from './signupApi'

interface AppState {
  loggedIn: boolean
  account: SignupSuccess | null

  hideCompletionScore: boolean

  setAccount: (account: SignupSuccess) => void
  signOut: () => void
  setHideCompletionScore: (v: boolean) => void
}

// Everything sign-out resets back to — the same shape a brand-new visitor
// on a brand-new device gets.
const freshDeviceState = {
  loggedIn: false,
  account: null,
  hideCompletionScore: false,
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...freshDeviceState,

      // Organizations get their own real page (Section 8.3), not the
      // personal calendar — so only an individual's sign-up/login grants
      // entry to it. This is the *only* way in: the flip screen's "Open
      // today's page" leads here rather than granting access itself, so
      // there's never a free, credential-less profile.
      setAccount: (account) =>
        set({ account, loggedIn: account.accountType === 'individual' ? true : get().loggedIn }),

      // Resets this device's local-only preference (hide-score toggle). The
      // real account's data (including avatar/bio, now server-side) is
      // unaffected; logging back in via /login restores access to it.
      signOut: () => set({ ...freshDeviceState }),

      setHideCompletionScore: (v) => set({ hideCompletionScore: v }),
    }),
    {
      name: 'prompt-app-store',
    },
  ),
)
