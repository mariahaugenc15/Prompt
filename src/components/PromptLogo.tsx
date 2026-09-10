import clsx from 'clsx'

/**
 * Text-based recreation of the wordmark (bold slab serif "Prompt" with the
 * "o" in the app's accent color) rather than a raster image, so it stays
 * crisp at any size and reuses the app's own accent color token.
 */
export function PromptLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-baseline leading-none font-bold text-ink', className)}
      style={{ fontFamily: 'var(--font-slab)', fontSize: size, letterSpacing: '-0.01em' }}
    >
      Pr<span className="text-accent">o</span>mpt
    </span>
  )
}

export function PromptMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('relative inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink', className)}
      style={{ width: size, height: size }}
    >
      <span className="rounded-full bg-accent" style={{ width: size * 0.46, height: size * 0.46 }} />
    </span>
  )
}
