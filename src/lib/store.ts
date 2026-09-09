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
  onboarded: boolean
  account: SignupSuccess | null

  users: User[]
  following: string[]
  followers: string[]
  promptPermission: PromptPermission
  hideCompletionScore: boolean

  challengeLibrary: typeof seedChallengeLibrary
  prompts: Prompt[]
  boards: Board[]
  boardChallenges: BoardChallenge[]
  submissions: Submission[]
  calendars: UserCalendar[]

  login: () => void
  completeOnboarding: () => void
  setAccount: (account: SignupSuccess) => void
  followUser: (userId: string) => void
  subscribeStarterBoard: (boardId: string) => void

  canReceiveFrom: (fromUserId: string) => boolean
  sendPrompt: (toUserId: string, opts: { text: string; category: Category; anonymous: boolean }) => void
  simulateIncomingPrompt: () => string | null
  acceptPrompt: (promptId: string) => void
  declinePrompt: (promptId: string) => void
  completeChallenge: (promptId: string, proof: Proof, calendarIds?: string[]) => void

  createBoard: (opts: {
    name: string
    description: string
    category: BoardCategory
    visibility: 'public' | 'invite'
    locationTag?: string
  }) => string
  joinBoard: (boardId: string) => void
  postBoardChallenge: (boardId: string, opts: { text: string; category: Category; cadence: BoardChallenge['cadence'] }) => void

  upvoteSubmission: (submissionId: string) => void
  pinSubmission: (submissionId: string) => void

  setPromptPermission: (p: PromptPermission) => void
  setHideCompletionScore: (v: boolean) => void

  createCalendar: (name: string, visibility: CalendarVisibility) => string
  joinCalendar: (calendarId: string) => void
  leaveCalendar: (calendarId: string) => void
  setCalendarVisibility: (calendarId: string, visibility: CalendarVisibility) => void
  tagPromptCalendars: (promptId: string, calendarIds: string[]) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      onboarded: false,
      account: null,

      users: seedUsers,
      following: [],
      followers: ['u1', 'u2', 'u4'],
      promptPermission: 'mutuals',
      hideCompletionScore: false,

      challengeLibrary: seedChallengeLibrary,
      prompts: [],
      boards: seedBoards,
      boardChallenges: [],
      submissions: seedSubmissions,
      calendars: seedCalendars,

      login: () => set({ loggedIn: true }),
      completeOnboarding: () => set({ onboarded: true }),
      // Organizations get their own real page (Section 8.3), not the mock
      // personal calendar — so only an individual's sign-up unlocks it.
      setAccount: (account) => set({ account, loggedIn: account.accountType === 'individual' ? true : get().loggedIn }),

      followUser: (userId) =>
        set((s) => (s.following.includes(userId) ? s : { following: [...s.following, userId] })),

      subscribeStarterBoard: (boardId) => get().joinBoard(boardId),

      canReceiveFrom: (fromUserId) => {
        const s = get()
        if (s.promptPermission === 'everyone') return true
        if (s.promptPermission === 'followers') return s.followers.includes(fromUserId)
        return s.followers.includes(fromUserId) && s.following.includes(fromUserId)
      },

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

      simulateIncomingPrompt: () => {
        const s = get()
        const candidates = s.users.filter((u) => s.canReceiveFrom(u.id))
        if (candidates.length === 0) return null
        const sender = candidates[Math.floor(Math.random() * candidates.length)]
        const template = s.challengeLibrary[Math.floor(Math.random() * s.challengeLibrary.length)]
        const anonymous = Math.random() < 0.4
        const prompt: Prompt = {
          id: uid('p'),
          category: template.category,
          text: template.text,
          fromUserId: sender.id,
          toUserId: CURRENT_USER_ID,
          anonymous,
          status: 'pending',
          createdAt: Date.now(),
        }
        set({ prompts: [...s.prompts, prompt] })
        return prompt.id
      },

      acceptPrompt: (promptId) =>
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === promptId ? { ...p, status: 'accepted', acceptedAt: Date.now(), dayKey: todayKey() } : p,
          ),
        })),

      declinePrompt: (promptId) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === promptId ? { ...p, status: 'declined' } : p)),
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
          subscriberIds: [],
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
              status: 'pending',
              createdAt: Date.now(),
            }))
          return { boardChallenges: [...s.boardChallenges, challenge], prompts: [...s.prompts, ...fanOut] }
        }),

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
    }),
    {
      name: 'prompt-app-store',
      partialize: (s) => {
        const { loggedIn: _loggedIn, ...rest } = s
        return rest
      },
    },
  ),
)

export { currentUser }
