import clsx from 'clsx'
import { MicIcon } from './Icons'

// Shared playback chrome for an "audio" proof submission, used everywhere
// a CompletionView can render media: day detail, board submission
// gallery, and the feed.
export function AudioProofPlayer({ src, className }: { src: string; className?: string }) {
  return (
    <div className={clsx('mb-2 flex items-center gap-2 rounded-sm border border-line bg-paper-dim p-2.5', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink-soft">
        <MicIcon size={14} />
      </span>
      <audio src={src} controls className="h-8 w-full min-w-0 flex-1" />
    </div>
  )
}
