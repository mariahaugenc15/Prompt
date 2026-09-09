import type { ReactNode } from 'react'
import clsx from 'clsx'

export function IndexCard({
  children,
  className,
  as: Tag = 'div',
  onClick,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'button'
  onClick?: () => void
}) {
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'bg-card border border-line rounded-sm shadow-card text-left',
        Tag === 'button' && 'cursor-pointer transition hover:border-line-strong hover:-translate-y-0.5',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardStamp({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
      {label}
    </span>
  )
}
