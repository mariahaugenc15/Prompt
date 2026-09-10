import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Board,
  BoardCategory,
  BoardChallenge,
  CalendarVisibility,
  Category,
  Prompt,
  Proof,
  PromptPermission,
  Submission,
  User,
  UserCalendar,
} from './types'
import {
  CURRENT_USER_ID,
  currentUser,
  seedBoards,
  seedCalendars,
  seedChallengeLibrary,
  seedSubmissions,
  seedUsers,
} from './seed'
import type { SignupSuccess } from './signupApi'

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

interface AppState {
  loggedIn: boolean
  account: SignupSuccess | null

  users: User[]
  following: string[]
  followers: string[]
  promptPermission: PromptPermission
  hideCompletionScore: boolean
  avatarDataUrl: string | null
  bio: string

  challengeLibrary: typeof seedChallengeLibrary
  prompts: Prompt[]
  boards: Board[]
  boardChallenges: BoardChallenge[]
  submissions: Submission[]
  calendars: UserCalendar[]

  setAccount: (account: SignupSuccess) => void
  signOut: () => void
  followUser: (userId: string) => void
  unfollowUser: (userId: string) => void

  sendPrompt: (toUserId: string, opts: { text: string; category: Category; anonymous: boolean }) => void
  acceptPrompt: (promptId: string) => void
  completeChallenge: (promptId: string, proof: Proof, calendarIds?: string[]) => void
  setDayCover: (dayKey: string, promptId: string) => void

  createBoard: (opts: {
    name: string
    description: string
    category: BoardCategory
    visibility: 'public' | 'invite'
    locationTag?: string
  }) => string
  joinBoard: (boardId: string) => void
  inviteToBoard: (boardId: string, userId: string) => void
  postBoardChallenge: (boardId: string, opts: { text: string; category: Category; cadence: BoardChallenge['cadence'] }) => void
  adoptBoardChallenge: (challengeId: string) => string | null

  upvoteSubmission: (submissionId: string) => void
  pinSubmission: (submissionId: string) => void

  setPromptPermission: (p: PromptPermission) => void
  setHideCompletionScore: (v: boolean) => void
  setAvatar: (dataUrl: string | null) => void
  setBio: (bio: string) => void

  createCalendar: (name: string, visibility: CalendarVisibility) => string
  joinCalendar: (calendarId: string) => void
  leaveCalendar: (calendarId: string) => void
  setCalendarVisibility: (calendarId: string, visibility: CalendarVisibility) => void
  tagPromptCalendars: (promptId: string, calendarIds: string[]) => void
}

// Everything sign-out resets back to — the same shape a brand-new visitor
// on a brand-new device gets. `users` and `challengeLibrary` are static app
// content no action ever mutates, so they're not part of this.
const freshDeviceState = {
  loggedIn: false,
  account: null,
  following: [],
  followers: ['u1', 'u2', 'u4'],
  promptPermission: 'mutuals' as PromptPermission,
  hideCompletionScore: false,
  avatarDataUrl: null,
  bio: '',
  prompts: [],
  boards: seedBoards,
  boardChallenges: [],
  submissions: seedSubmissions,
  calendars: seedCalendars,
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...freshDeviceState,
      users: seedUsers,
      challengeLibrary: seedChallengeLibrary,

      // Organizations get their own real page (Section 8.3), not the mock
      // personal calendar — so only an individual's sign-up/login grants
      // entry to it. This is the *only* way in: the flip screen's "Open
      // today's page" leads here rather than granting access itself, so
      // there's never a free, credential-less profile.
      setAccount: (account) =>
        set({ account, loggedIn: account.accountType === 'individual' ? true : get().loggedIn }),

      // Resets this device back to a brand-new visitor's state: the mock
      // calendar/feed/boards layer is local-only with no per-account
      // identity of its own (see README), so there's no meaningful "your
      // data, waiting for you" to preserve across a sign-out here — it's
      // this device's demo state, not an account's. A real account's data
      // lives on the server regardless and is unaffected; logging back in
      // via /login with that username/password restores access to it.
      signOut: () => set({ ...freshDeviceState }),

      followUser: (userId) =>
        set((s) => (s.following.includes(userId) ? s : { following: [...s.following, userId] })),

      unfollowUser: (userId) => set((s) => ({ following: s.following.filter((id) => id !== userId) })),

      sendPrompt: (toUserId, opts) =>
        set((s) => ({
          prompts: [
            ...s.prompts,
            {
              id: uid('p'),
              category: opts.category,
              text: opts.text,
              fromUserId: CURRENT_USER_ID,
              toUserId,
              anonymous: opts.anonymous,
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        })),

      acceptPrompt: (promptId) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === promptId ? { ...p, status: 'accepted', acceptedAt: Date.now(), dayKey: todayKey() } : p,
          ),
        })),

      completeChallenge: (promptId, proof, calendarIds) =>
        set((s) => {
          const prompt = s.prompts.find((p) => p.id === promptId)
          if (!prompt) return s
          const dayKey = prompt.dayKey ?? todayKey()
          const updatedPrompts = s.prompts.map((p) =>
            p.id === promptId
              ? { ...p, status: 'completed' as const, completedAt: Date.now(), dayKey, proof, calendarIds }
              : p,
          )
          const submission: Submission = {
            id: uid('sub'),
            promptId,
            userId: CURRENT_USER_ID,
            category: prompt.category,
            text: prompt.text,
            caption: proof.caption,
            proof,
            boardId: prompt.boardId,
            boardChallengeId: prompt.boardChallengeId,
            assignedByUserId: prompt.anonymous ? undefined : prompt.fromUserId,
            anonymous: prompt.anonymous,
            createdAt: Date.now(),
            upvotes: [],
            pins: [],
          }
          return { prompts: updatedPrompts, submissions: [...s.submissions, submission] }
        }),

      createBoard: (opts) => {
        const id = uid('b')
        const board: Board = {
          id,
          name: opts.name,
          description: opts.description,
          category: opts.category,
          ownerId: CURRENT_USER_ID,
          visibility: opts.visibility,
          locationTag: opts.locationTag,
          subscriberIds: [CURRENT_USER_ID],
        }
        set((s) => ({ boards: [...s.boards, board] }))
        return id
      },

      joinBoard: (boardId) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.subscriberIds.includes(CURRENT_USER_ID) || b.id !== boardId
              ? b
              : { ...b, subscriberIds: [...b.subscriberIds, CURRENT_USER_ID] },
          ),
        })),

      // A private group has no public "Subscribe" button (see Boards.tsx's
      // Discover filter) — membership only ever comes from the owner adding
      // someone here. There's no second device to send a real invite to in
      // this single-device mock, so accepting is implicit: the person is
      // simply added, the same way postBoardChallenge already treats a
      // board's own subscriber list as ground truth.
      inviteToBoard: (boardId, userId) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId && !b.subscriberIds.includes(userId) ? { ...b, subscriberIds: [...b.subscriberIds, userId] } : b,
          ),
        })),

      postBoardChallenge: (boardId, opts) =>
        set((s) => {
          const board = s.boards.find((b) => b.id === boardId)
          if (!board) return s
          const challenge: BoardChallenge = {
            id: uid('bc'),
            boardId,
            category: opts.category,
            text: opts.text,
            cadence: opts.cadence,
            createdAt: Date.now(),
          }
          const recipients = board.subscriberIds.includes(CURRENT_USER_ID)
            ? board.subscriberIds
            : [...board.subscriberIds, CURRENT_USER_ID]
          const fanOut: Prompt[] = recipients
            .filter((id) => id === CURRENT_USER_ID)
            .map((id) => ({
              id: uid('p'),
              category: opts.category,
              text: opts.text,
              fromUserId: board.ownerId,
              toUserId: id,
              anonymous: false,
              boardId,
              boardChallengeId: challenge.id,
              status: 'pending',
              createdAt: Date.now(),
            }))
          return { boardChallenges: [...s.boardChallenges, challenge], prompts: [...s.prompts, ...fanOut] }
        }),

      // Explore → "Try it" adopts a public board's challenge directly into
      // today's calendar as already-accepted — the user opted in by picking
      // it themselves, so there's no accept/decline fridge-note ritual to
      // go through first, unlike a challenge someone else sent them.
      adoptBoardChallenge: (challengeId) => {
        const s = get()
        const challenge = s.boardChallenges.find((c) => c.id === challengeId)
        const board = challenge && s.boards.find((b) => b.id === challenge.boardId)
        if (!challenge || !board) return null
        const id = uid('p')
        const prompt: Prompt = {
          id,
          category: challenge.category,
          text: challenge.text,
          fromUserId: board.ownerId,
          toUserId: CURRENT_USER_ID,
          anonymous: false,
          boardId: board.id,
          boardChallengeId: challenge.id,
          status: 'accepted',
          createdAt: Date.now(),
          acceptedAt: Date.now(),
          dayKey: todayKey(),
        }
        set({ prompts: [...s.prompts, prompt] })
        return id
      },

      upvoteSubmission: (submissionId) =>
        set((s) => ({
          submissions: s.submissions.map((sub) =>
            sub.id !== submissionId
              ? sub
              : {
                  ...sub,
                  upvotes: sub.upvotes.includes(CURRENT_USER_ID)
                    ? sub.upvotes.filter((id) => id !== CURRENT_USER_ID)
                    : [...sub.upvotes, CURRENT_USER_ID],
                },
          ),
        })),

      pinSubmission: (submissionId) =>
        set((s) => ({
          submissions: s.submissions.map((sub) =>
            sub.id !== submissionId
              ? sub
              : {
                  ...sub,
                  pins: sub.pins.includes(CURRENT_USER_ID)
                    ? sub.pins.filter((id) => id !== CURRENT_USER_ID)
                    : [...sub.pins, CURRENT_USER_ID],
                },
          ),
        })),

      setPromptPermission: (p) => set({ promptPermission: p }),
      setHideCompletionScore: (v) => set({ hideCompletionScore: v }),
      setAvatar: (dataUrl) => set({ avatarDataUrl: dataUrl }),
      setBio: (bio) => set({ bio }),

      createCalendar: (name, visibility) => {
        const id = uid('cal')
        const calendar: UserCalendar = { id, name, ownerId: CURRENT_USER_ID, visibility, memberIds: [CURRENT_USER_ID] }
        set((s) => ({ calendars: [...s.calendars, calendar] }))
        return id
      },

      joinCalendar: (calendarId) =>
        set((s) => ({
          calendars: s.calendars.map((c) =>
            c.id === calendarId && c.visibility === 'public' && !c.memberIds.includes(CURRENT_USER_ID)
              ? { ...c, memberIds: [...c.memberIds, CURRENT_USER_ID] }
              : c,
          ),
        })),

      leaveCalendar: (calendarId) =>
        set((s) => ({
          calendars: s.calendars.map((c) =>
            // The owner can't leave their own calendar — delete it instead (not exposed in v1).
            c.id === calendarId && c.ownerId !== CURRENT_USER_ID
              ? { ...c, memberIds: c.memberIds.filter((id) => id !== CURRENT_USER_ID) }
              : c,
          ),
        })),

      setCalendarVisibility: (calendarId, visibility) =>
        set((s) => ({
          calendars: s.calendars.map((c) => (c.id === calendarId && c.ownerId === CURRENT_USER_ID ? { ...c, visibility } : c)),
        })),

      tagPromptCalendars: (promptId, calendarIds) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === promptId ? { ...p, calendarIds } : p)),
        })),

      setDayCover: (dayKey, promptId) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.dayKey === dayKey ? { ...p, isDayCover: p.id === promptId } : p,
          ),
        })),
    }),
    {
      name: 'prompt-app-store',
    },
  ),
)

export { currentUser }
