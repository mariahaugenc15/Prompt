import { useState } from 'react'
import { fileToProofDataUrl } from '../lib/media'
import type { Proof } from '../lib/types'
import { CameraIcon, VideoIcon } from './Icons'

export interface CalendarOption {
  id: string
  name: string
  visibility: 'public' | 'private'
}

export function CompleteChallengeForm({
  onSubmit,
  calendarOptions = [],
}: {
  onSubmit: (proof: Proof, calendarIds: string[]) => void
  // Custom calendars (owned or joined) this completion can also be filed
  // into, beyond the default All Activity view. Omit to hide the picker.
  calendarOptions?: CalendarOption[]
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('photo')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { dataUrl, kind: resolvedKind } = await fileToProofDataUrl(file)
      setKind(resolvedKind)
      setPreview(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process that file — try another one.')
    } finally {
      setBusy(false)
    }
  }

  function toggleCalendar(id: string) {
    setSelectedCalendarIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex aspect-video cursor-pointer items-center justify-center rounded-sm border border-dashed border-line-strong bg-paper-dim text-ink-faint">
        {preview ? (
          kind === 'photo' ? (
            <img src={preview} alt="proof preview" className="h-full w-full rounded-sm object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-xs">
              <VideoIcon size={22} /> video attached
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs">
            <CameraIcon size={22} />
            {busy ? 'Processing…' : 'Add photo or video proof'}
          </div>
        )}
        <input
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption (optional)"
        rows={2}
        className="resize-none rounded-sm border border-line bg-card p-2.5 text-base outline-none focus:border-line-strong"
      />

      {calendarOptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wider text-ink-faint">Also file into</p>
          <div className="flex flex-wrap gap-1.5">
            {calendarOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCalendar(c.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  selectedCalendarIds.includes(c.id) ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        disabled={!preview || busy}
        onClick={() =>
          onSubmit({ type: kind, dataUrl: preview ?? undefined, caption: caption.trim() || undefined }, selectedCalendarIds)
        }
        className="rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        Mark it done
      </button>
    </div>
  )
}
