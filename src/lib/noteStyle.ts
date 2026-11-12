// Shared note-styling vocabulary (Phase 9.1), used by the sender's
// customizer (RealSend.tsx), the server's sanitizer (server/noteStyle.ts
// mirrors these exact string sets), and every surface that renders a
// note: FridgeNote.tsx (home), SentFlyAway.tsx (send animation), and
// DayDetailSheet.tsx (expanded/day detail).

export type NoteColor = 'butter' | 'blush' | 'sage' | 'sky' | 'terra'
export type NoteHandwriting = 'caveat' | 'kalam' | 'shadows'
export type NoteSticker = 'star' | 'heart' | 'cloud' | 'bolt' | 'sparkle'

export const NOTE_COLORS: NoteColor[] = ['butter', 'blush', 'sage', 'sky', 'terra']
export const NOTE_HANDWRITING_STYLES: NoteHandwriting[] = ['caveat', 'kalam', 'shadows']
export const NOTE_STICKERS: NoteSticker[] = ['star', 'heart', 'cloud', 'bolt', 'sparkle']

// Pastel enough to carry dark ink text at a comfortable contrast ratio —
// verified with the actual WCAG relative-luminance formula: --color-ink
// (#211f1c) against every one of these clears the 4.5:1 AA minimum by a
// wide margin (12.5:1 to 15.6:1, all effectively AAA too). butter
// (#fff9e0) matches the pre-Phase-9 hardcoded note color exactly, so an
// unstyled note's look doesn't change. terra reuses --color-accent-soft
// rather than a new value, per the "pull from existing tokens" rule.
export const NOTE_COLOR_HEX: Record<NoteColor, string> = {
  butter: '#fff9e0',
  blush: '#fde7e3',
  sage: '#e7efe0',
  sky: '#e2edf5',
  terra: '#f1ddd0',
}

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  butter: 'Butter',
  blush: 'Blush',
  sage: 'Sage',
  sky: 'Sky',
  terra: 'Terra-cotta',
}

// Each declares a generic `cursive` fallback so a blocked/slow Google
// Fonts load still renders something legible and in the right spirit,
// rather than an unstyled system serif looking broken mid-swap.
export const NOTE_HANDWRITING_FONT: Record<NoteHandwriting, string> = {
  caveat: "'Caveat', cursive",
  kalam: "'Kalam', cursive",
  shadows: "'Shadows Into Light', cursive",
}

export const NOTE_HANDWRITING_LABEL: Record<NoteHandwriting, string> = {
  caveat: 'Caveat',
  kalam: 'Kalam',
  shadows: 'Shadows',
}

export function isNoteColor(v: unknown): v is NoteColor {
  return typeof v === 'string' && (NOTE_COLORS as string[]).includes(v)
}
export function isNoteHandwriting(v: unknown): v is NoteHandwriting {
  return typeof v === 'string' && (NOTE_HANDWRITING_STYLES as string[]).includes(v)
}
export function isNoteSticker(v: unknown): v is NoteSticker {
  return typeof v === 'string' && (NOTE_STICKERS as string[]).includes(v)
}

export interface NoteStyle {
  noteColor?: NoteColor
  noteSticker?: NoteSticker
  noteHandwriting?: NoteHandwriting
}

// The look an unstyled (or pre-Phase-9) prompt renders with — identical
// to what every note looked like before this feature existed.
export const DEFAULT_NOTE_BG = NOTE_COLOR_HEX.butter
