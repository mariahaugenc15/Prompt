import type { Prompt, UserCalendar } from './types'

/**
 * A completion is public if it came from a public challenge (a community
 * board broadcast — those already have a public submission gallery, see
 * Section 2.2) or if it's tagged into at least one public calendar.
 * Board origin always wins: a private calendar can organize a board
 * completion for yourself, but it can't make it private — the board
 * already made it public the moment it was completed.
 */
export function isPromptPublic(prompt: Pick<Prompt, 'boardId' | 'calendarIds'>, calendars: UserCalendar[]): boolean {
  if (prompt.boardId) return true
  if (!prompt.calendarIds?.length) return false
  return prompt.calendarIds.some((id) => calendars.find((c) => c.id === id)?.visibility === 'public')
}
