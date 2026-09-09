import { useState } from 'react'
import { fileToCompressedDataUrl } from '../lib/media'
import type { Proof } from '../lib/types'
import { CameraIcon, VideoIcon } from './Icons'

export function CompleteChallengeForm({ onSubmit }: { onSubmit: (proof: Proof) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('photo')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setKind(file.type.startsWith('video') ? 'video' : 'photo')
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      setPreview(dataUrl)
    } finally {
      setBusy(false)
    }
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
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption (optional)"
        rows={2}
        className="resize-none rounded-sm border border-line bg-card p-2.5 text-base outline-none focus:border-line-strong"
      />
      <button
        disabled={!preview || busy}
        onClick={() => onSubmit({ type: kind, dataUrl: preview ?? undefined, caption: caption.trim() || undefined })}
        className="rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        Mark it done
      </button>
    </div>
  )
}
