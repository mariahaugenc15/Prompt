import { useEffect, useRef, useState } from 'react'
import { LeafIcon } from './Icons'

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// Unplugging isn't proved with a photo — the point is putting the phone
// down — so this times the stretch instead and asks what you did with it,
// rather than reusing RealCompleteForm's camera-first flow.
export function UnplugCompleteForm({
  senderDisplayName,
  promptText,
  onSubmit,
  submitting,
}: {
  senderDisplayName: string
  promptText: string
  onSubmit: (input: { caption: string }) => void
  submitting?: boolean
}) {
  const [running, setRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [reflection, setReflection] = useState('')
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [running])

  function handleStart() {
    startedAtRef.current = Date.now() - elapsedSeconds * 1000
    setRunning(true)
  }

  function handleStop() {
    setRunning(false)
  }

  function handleSubmit() {
    const minutes = Math.round(elapsedSeconds / 60)
    const durationText = minutes < 1 ? 'less than a minute' : `${minutes} minute${minutes === 1 ? '' : 's'}`
    const caption = reflection.trim() ? `Unplugged for ${durationText}: ${reflection.trim()}` : `Unplugged for ${durationText}`
    onSubmit({ caption })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-sm border border-line bg-paper-dim px-3 py-2 text-sm italic text-ink-soft">
        {senderDisplayName} prompted: "{promptText}"
      </p>

      <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-line-strong bg-paper-dim py-6">
        <LeafIcon size={26} className="text-success" />
        <p className="font-mono text-3xl tabular-nums text-ink">{formatDuration(elapsedSeconds)}</p>
        {!running ? (
          <button
            onClick={handleStart}
            className="rounded-sm border border-ink bg-ink px-5 py-2 text-sm font-medium text-paper"
          >
            {elapsedSeconds > 0 ? 'Resume' : 'Start unplugging'}
          </button>
        ) : (
          <button onClick={handleStop} className="rounded-sm border border-line px-5 py-2 text-sm text-ink-soft">
            Stop
          </button>
        )}
      </div>

      <label className="text-xs text-ink-faint">
        What did you do while you were unplugged?
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={2}
          placeholder="Went for a walk, read a book…"
          className="mt-1 w-full resize-none rounded-sm border border-line bg-card p-2.5 text-base text-ink outline-none focus:border-line-strong"
        />
      </label>

      <button
        disabled={running || elapsedSeconds === 0 || submitting}
        onClick={handleSubmit}
        className="rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Posting…' : 'Complete it'}
      </button>
    </div>
  )
}
