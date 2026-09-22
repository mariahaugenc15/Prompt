import { useState } from 'react'
import { fileToProofDataUrl } from '../lib/media'
import { CameraIcon, VideoIcon } from './Icons'

export function RealCompleteForm({
  senderDisplayName,
  promptText,
  onSubmit,
  submitting,
}: {
  senderDisplayName: string
  promptText: string
  onSubmit: (input: { mediaType: string; mediaDataUrl: string; caption?: string }) => void
  submitting?: boolean
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('photo')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-sm border border-line bg-paper-dim px-3 py-2 text-sm italic text-ink-soft">
        {senderDisplayName} prompted: "{promptText}"
      </p>

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

      <label className="text-xs text-ink-faint">
        Your caption (added after the line above)
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          placeholder="Add your own words…"
          className="mt-1 w-full resize-none rounded-sm border border-line bg-card p-2.5 text-base text-ink outline-none focus:border-line-strong"
        />
      </label>

      <button
        disabled={!preview || busy || submitting}
        onClick={() => onSubmit({ mediaType: kind, mediaDataUrl: preview!, caption: caption.trim() || undefined })}
        className="rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Posting…' : 'Complete it'}
      </button>
    </div>
  )
}
