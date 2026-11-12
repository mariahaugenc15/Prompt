// Server-side mirror of src/lib/noteStyle.ts's allowed value sets. Kept as
// a separate, duplicated list (rather than importing the client module)
// so this file has zero dependency on anything React/browser-only — the
// two must be kept in sync by hand, which is an acceptable cost for never
// trusting a styling value the client sends beyond "is it one of these
// exact strings."
const NOTE_COLORS = new Set(['butter', 'blush', 'sage', 'sky', 'terra'])
const NOTE_STICKERS = new Set(['star', 'heart', 'cloud', 'bolt', 'sparkle'])
const NOTE_HANDWRITING_STYLES = new Set(['caveat', 'kalam', 'shadows'])

export interface SanitizedNoteStyle {
  noteColor: string | null
  noteSticker: string | null
  noteHandwriting: string | null
}

// Anything not in the allowed set (including every type other than a
// plain string) becomes null — "render with the default look" — rather
// than being rejected outright, since styling is optional and a bad value
// here was never going to be the user's fault to begin with (an old
// client build, a tampered request). Only the request body's own three
// fields are ever read; nothing here can set another prompt's styling.
export function sanitizeNoteStyle(body: unknown): SanitizedNoteStyle {
  const b = (body ?? {}) as { noteColor?: unknown; noteSticker?: unknown; noteHandwriting?: unknown }
  return {
    noteColor: typeof b.noteColor === 'string' && NOTE_COLORS.has(b.noteColor) ? b.noteColor : null,
    noteSticker: typeof b.noteSticker === 'string' && NOTE_STICKERS.has(b.noteSticker) ? b.noteSticker : null,
    noteHandwriting:
      typeof b.noteHandwriting === 'string' && NOTE_HANDWRITING_STYLES.has(b.noteHandwriting) ? b.noteHandwriting : null,
  }
}
