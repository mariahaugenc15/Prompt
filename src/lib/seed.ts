import type { Board, ChallengeTemplate, Submission, User } from './types'

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

export const seedBoards: Board[] = [
  {
    id: 'b1',
    name: 'Pick It Up',
    description: 'A neighborhood cleanup challenge. Pick up one piece of trash and record it.',
    category: 'nonprofit',
    ownerId: 'u5',
    visibility: 'public',
    locationTag: 'Near you',
    subscriberIds: ['u1', 'u2'],
  },
  {
    id: 'b2',
    name: 'Field Notes Coffee',
    description: 'Today, find something pink. New drop every Friday.',
    category: 'brand',
    ownerId: 'u3',
    visibility: 'public',
    subscriberIds: ['u2', 'u4'],
  },
  {
    id: 'b3',
    name: 'Sunrise Book Club',
    description: 'Weekly reading prompts for people who never finish the book.',
    category: 'interest',
    ownerId: 'u4',
    visibility: 'public',
    subscriberIds: [],
  },
]

const HOUR = 1000 * 60 * 60

export const seedSubmissions: Submission[] = [
  {
    id: 'sub_seed_1',
    promptId: 'seed_p1',
    userId: 'u1',
    category: 'snap',
    text: 'Find something pink and photograph it.',
    caption: 'The only pink thing in my kitchen, apparently.',
    assignedByUserId: 'u2',
    anonymous: false,
    createdAt: Date.now() - 3 * HOUR,
    upvotes: ['u2'],
    pins: [],
  },
  {
    id: 'sub_seed_2',
    promptId: 'seed_p2',
    userId: 'u3',
    category: 'show',
    text: 'Do your best dance move on camera.',
    caption: 'No regrets.',
    anonymous: true,
    createdAt: Date.now() - 8 * HOUR,
    upvotes: ['u1', 'u2', 'u4'],
    pins: ['u2'],
  },
  {
    id: 'sub_seed_3',
    promptId: 'seed_p3',
    userId: 'u2',
    category: 'unplug',
    text: 'Eat one meal today with no screens.',
    caption: 'Harder than it sounds.',
    assignedByUserId: 'u1',
    anonymous: false,
    createdAt: Date.now() - 26 * HOUR,
    upvotes: [],
    pins: [],
  },
  {
    id: 'sub_seed_4',
    promptId: 'seed_p4',
    userId: 'u2',
    category: 'snap',
    text: 'Pick up one piece of trash and record it.',
    caption: 'Cleared the whole block.',
    boardId: 'b1',
    anonymous: false,
    createdAt: Date.now() - 5 * HOUR,
    upvotes: ['u5'],
    pins: [],
  },
  {
    id: 'sub_seed_5',
    promptId: 'seed_p5',
    userId: 'u4',
    category: 'snap',
    text: 'Today, find something pink.',
    caption: 'Sunset counts, right?',
    boardId: 'b2',
    anonymous: false,
    createdAt: Date.now() - 30 * HOUR,
    upvotes: ['u2', 'u3'],
    pins: ['u2'],
  },
]
