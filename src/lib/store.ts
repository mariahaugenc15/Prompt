import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SignupSuccess } from './signupApi'

interface AppState {
  loggedIn: boolean
  account: SignupSuccess | null

  hideCompletionScore: boolean
  avatarDataUrl: string | null
  bio: string

  setAccount: (account: SignupSuccess) => void
  signOut: () => void
  setHideCompletionScore: (v: boolean) => void
  setAvatar: (dataUrl: string | null) => void
  setBio: (bio: string) => void
}

// Everything sign-out resets back to — the same shape a brand-new visitor
// on a brand-new device gets.
const freshDeviceState = {
  loggedIn: false,
  account: null,
  hideCompletionScore: false,
  avatarDataUrl: null,
  bio: '',
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

      // Resets this device's local-only preferences (avatar, bio, hide-score
      // toggle). The real account's data lives on the server regardless and
      // is unaffected; logging back in via /login with that username/
      // password restores access to it.
      signOut: () => set({ ...freshDeviceState }),

      setHideCompletionScore: (v) => set({ hideCompletionScore: v }),
      setAvatar: (dataUrl) => set({ avatarDataUrl: dataUrl }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'prompt-app-store',
    },
  ),
)
