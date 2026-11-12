// A short, quiet "thud" synthesized with the Web Audio API rather than a
// shipped audio asset — a couple of lines of oscillator + envelope gives
// the stamp-moment sound (Phase 8) without adding a binary file to the
// bundle. Always gated by the caller checking stampSoundEnabled first
// (src/lib/store.ts) — this function itself just plays, unconditionally.
let sharedContext: AudioContext | undefined

export function playStampThud(): void {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    sharedContext ??= new AudioContextCtor()
    const ctx = sharedContext
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.16)
  } catch {
    // Best-effort — a blocked/unavailable AudioContext (e.g. autoplay
    // policy before any user gesture) should never break completing a
    // prompt, it just means no sound this time.
  }
}
