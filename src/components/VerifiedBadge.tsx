// A small checkmark next to a name — the visible half of the verification
// system (server/verificationRoutes.ts): lets a viewer tell an org/public
// figure whose identity Prompt actually reviewed from anyone else using a
// similar name.
export function VerifiedBadge({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-label="Verified"
      role="img"
    >
      <title>Verified</title>
      <path
        d="M10 1.5l2.2 1.27 2.53-.3 1.03 2.33 2.24 1.3-.53 2.5.53 2.5-2.24 1.3-1.03 2.33-2.53-.3L10 15.98l-2.2-1.27-2.53.3-1.03-2.33-2.24-1.3.53-2.5-.53-2.5 2.24-1.3L5.27 2.47l2.53.3L10 1.5z"
        fill="var(--color-accent)"
      />
      <path d="M6.5 10.2l2.2 2.2 4.3-4.9" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
