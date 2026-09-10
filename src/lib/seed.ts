import type { Board, ChallengeTemplate, Submission, User, UserCalendar } from './types'

export const CURRENT_USER_ID = 'me'

export const currentUser: User = { id: CURRENT_USER_ID, name: 'You', handle: '@you', initial: 'Y' }

export const seedUsers: User[] = [
  { id: 'u1', name: 'Sam Rivera', handle: '@samr', initial: 'S' },
  { id: 'u2', name: 'Priya Nair', handle: '@priyan', initial: 'P' },
  { id: 'u3', name: 'Jordan Blake', handle: '@jblake', initial: 'J' },
  { id: 'u4', name: 'Theo Marsh', handle: '@theom', initial: 'T' },
  { id: 'u5', name: 'Ama Osei', handle: '@amao', initial: 'A' },
]

export const seedChallengeLibrary: ChallengeTemplate[] = [
  { id: 'c1', category: 'snap', text: 'Snap the view from wherever you are right now.' },
  { id: 'c2', category: 'snap', text: 'Find something pink and photograph it.' },
  { id: 'c3', category: 'snap', text: 'Take a photo of the last thing you cooked or ate.' },
  { id: 'c4', category: 'sound', text: 'Record 10 seconds of the sound around you right now.' },
  { id: 'c5', category: 'sound', text: 'Sing the chorus of a song stuck in your head.' },
  { id: 'c6', category: 'show', text: 'Show us your current desk or workspace in 5 seconds.' },
  { id: 'c7', category: 'show', text: 'Do your best dance move on camera.' },
  { id: 'c8', category: 'share', text: 'Post one thing you’re grateful for today.' },
  { id: 'c9', category: 'share', text: 'Share a compliment with someone in person, then tell us how it went.' },
  { id: 'c10', category: 'unplug', text: 'Put your phone away for the next 30 minutes. Tell us what you did instead.' },
  { id: 'c11', category: 'unplug', text: 'Eat one meal today with no screens.' },
  { id: 'c12', category: 'snap', text: 'Find something in nature you’ve never noticed before.' },
]

// No pre-existing boards, calendars, or submissions — a real signup starts
// with a genuinely empty feed, board list, and calendar list rather than a
// fabricated history of posts/communities that never actually happened.
// seedUsers above stays: it's the roster of people the local single-device
// simulation (fridge notes, Simulate a prompt, Send a prompt) interacts
// with, not fabricated activity — there's no real backend for this mock
// layer (see README), so without *some* other party to follow/receive
// from/send to, onboarding and the whole accept/decline/complete loop would
// have no way to ever start.
export const seedBoards: Board[] = []
export const seedCalendars: UserCalendar[] = []
export const seedSubmissions: Submission[] = []
