export type Category = 'snap' | 'sound' | 'show' | 'share' | 'unplug'

export const CATEGORY_META: Record<Category, { label: string; emoji: string }> = {
  snap: { label: 'Snap it', emoji: '📸' },
  sound: { label: 'Sound it', emoji: '🎤' },
  show: { label: 'Show it', emoji: '🎥' },
  share: { label: 'Share it', emoji: '🙏' },
  unplug: { label: 'Unplug it', emoji: '🌿' },
}

export type PromptPermission = 'everyone' | 'followers' | 'mutuals'

export interface User {
  id: string
  name: string
  handle: string
  initial: string
}

export interface ChallengeTemplate {
  id: string
  category: Category
  text: string
}

export type PromptStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'expired'

export interface Proof {
  type: 'photo' | 'video' | 'text'
  dataUrl?: string
  caption?: string
}

export interface Prompt {
  id: string
  category: Category
  text: string
  fromUserId: string
  toUserId: string
  anonymous: boolean
  boardId?: string
  status: PromptStatus
  createdAt: number
  acceptedAt?: number
  completedAt?: number
  dayKey?: string // YYYY-MM-DD, set on accept — the day it's "written into"
  proof?: Proof
  calendarIds?: string[] // custom calendars this completion is filed into, beyond the default All Activity view
  isDayCover?: boolean // when a day has multiple completions, which photo shows on the calendar cell
}

export type CalendarVisibility = 'public' | 'private'

export interface UserCalendar {
  id: string
  name: string
  ownerId: string
  visibility: CalendarVisibility
  memberIds: string[] // includes the owner; others who have joined a public calendar
}

export type BoardCategory = 'brand' | 'nonprofit' | 'creator' | 'local' | 'interest'

export interface Board {
  id: string
  name: string
  description: string
  category: BoardCategory
  ownerId: string
  visibility: 'public' | 'invite'
  locationTag?: string
  subscriberIds: string[]
}

export interface BoardChallenge {
  id: string
  boardId: string
  category: Category
  text: string
  cadence: 'one-off' | 'daily' | 'weekly'
  createdAt: number
}

export interface Submission {
  id: string
  promptId: string
  userId: string
  category: Category
  text: string
  caption?: string
  proof?: Proof
  boardId?: string
  assignedByUserId?: string
  anonymous: boolean
  createdAt: number
  upvotes: string[]
  pins: string[]
}
