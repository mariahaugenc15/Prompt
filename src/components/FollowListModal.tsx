import { Link } from 'react-router-dom'
import { CloseIcon } from './Icons'
import type { PublicProfile } from '../lib/realAccountsApi'

// The follow graph is one of the ways people find each other — see who an
// account you already know follows, or who follows them, rather than
// search being the only door in.
export function FollowListModal({
  title,
  profiles,
  loading,
  onClose,
}: {
  title: string
  profiles: PublicProfile[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-sm flex-col rounded-t-md border border-line bg-card sm:rounded-md"
      >
        <div className="flex items-center justify-between border-b border-line p-3">
          <p className="text-sm font-medium">{title}</p>
          <button onClick={onClose} className="-m-2 p-2 text-ink-faint">
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-ink-faint">Nobody here yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {profiles.map((p) => (
                <Link
                  key={p.id}
                  to={`/o/${p.username}`}
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-sm border border-line bg-paper px-3 py-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-sm">
                    {p.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{p.displayName}</p>
                    <p className="text-xs text-ink-faint">@{p.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
