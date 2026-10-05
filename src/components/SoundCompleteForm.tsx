import { useEffect, useRef, useState } from 'react'
import { MicIcon } from './Icons'
import { blobToAudioDataUrl, fileToAudioDataUrl, MAX_AUDIO_DURATION_SECONDS } from '../lib/media'

type RecorderState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'denied' | 'unsupported'

function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

// "Sound it" completions are audio-only — no photo, no video. Offers an
// in-app recorder (start/stop/re-record/playback) with a graceful fallback
// to picking an existing audio file, for browsers/devices where recording
// isn't available or microphone access is denied.
export function SoundCompleteForm({
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
  const [state, setState] = useState<RecorderState>(() => (recordingSupported() ? 'idle' : 'unsupported'))
  const [preview, setPreview] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    stopTimer()
    releaseStream()
  }, [])

  async function startRecording() {
    setError(null)
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        releaseStream()
        // Strip any codec parameter (e.g. "audio/webm;codecs=opus") so the
        // resulting data: URL has a plain "<mime>;base64,..." shape the
        // server's media-saving regex expects — the container bytes
        // themselves are unaffected, just the declared label.
        const baseType = (recorder.mimeType || 'audio/webm').split(';')[0] || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: baseType })
        try {
          const dataUrl = await blobToAudioDataUrl(blob)
          setPreview(dataUrl)
          setState('recorded')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not process that recording.')
          setState('idle')
        }
      }

      recorder.start()
      setElapsed(0)
      setState('recording')
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1
          if (next >= MAX_AUDIO_DURATION_SECONDS) stopRecording()
          return next
        })
      }, 1000)
    } catch {
      setState('denied')
    }
  }

  function stopRecording() {
    stopTimer()
    recorderRef.current?.stop()
  }

  function reRecord() {
    setPreview(null)
    setError(null)
    setState('idle')
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const dataUrl = await fileToAudioDataUrl(file)
      setPreview(dataUrl)
      setState('recorded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process that file.')
    }
  }

  const showFilePicker = state !== 'recording' && state !== 'requesting'

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-sm border border-line bg-paper-dim px-3 py-2 text-sm italic text-ink-soft">
        {senderDisplayName} prompted: "{promptText}"
      </p>

      <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed border-line-strong bg-paper-dim p-5">
        {state === 'unsupported' && (
          <p className="text-center text-xs text-ink-faint">
            Recording isn't supported on this device. Choose an audio file instead.
          </p>
        )}
        {state === 'denied' && (
          <p className="text-center text-xs text-ink-faint">
            Microphone access was denied. Allow microphone access in your settings to record, or choose an audio
            file instead.
          </p>
        )}
        {state === 'idle' && (
          <>
            <MicIcon size={24} className="text-ink-faint" />
            <button onClick={startRecording} className="rounded-sm border border-ink px-4 py-1.5 text-xs font-medium">
              Start recording
            </button>
          </>
        )}
        {state === 'requesting' && <p className="text-xs text-ink-faint">Requesting microphone access…</p>}
        {state === 'recording' && (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <p className="text-sm text-ink-soft">
              Recording… {elapsed}s / {MAX_AUDIO_DURATION_SECONDS}s
            </p>
            <button onClick={stopRecording} className="rounded-sm border border-ink bg-ink px-4 py-1.5 text-xs font-medium text-paper">
              Stop
            </button>
          </>
        )}
        {state === 'recorded' && preview && (
          <>
            <audio src={preview} controls className="w-full" />
            <button onClick={reRecord} className="text-xs text-ink-faint underline underline-offset-2">
              Re-record
            </button>
          </>
        )}
        {showFilePicker && (
          <label className="mt-1 cursor-pointer text-xs text-ink-faint underline underline-offset-2">
            Or choose an audio file
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
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
        disabled={!preview || submitting}
        onClick={() => onSubmit({ mediaType: 'audio', mediaDataUrl: preview!, caption: caption.trim() || undefined })}
        className="rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {submitting ? 'Posting…' : 'Complete it'}
      </button>
    </div>
  )
}
