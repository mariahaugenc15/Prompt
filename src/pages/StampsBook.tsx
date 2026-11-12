import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { BackIcon } from '../components/Icons'
import { Stamp } from '../components/Stamp'
import { LoadingMark } from '../components/LoadingMark'
import { CATEGORY_META } from '../lib/types'
import { getStampBook, type StampBookEntry } from '../lib/stampsApi'
import { useEffectGuard } from '../lib/useEffectGuard'

// Reachable from any profile (see EditProfile.tsx's "My page" section and
// OrgPage.tsx) — structured so a future seasonal set is just more entries
// here, no schema change: this page only ever renders what
// server/stampsRepo.ts's getStampBook returns, never a hardcoded list of
// categories of its own.
export function StampsBook() {
  const { username = '' } = useParams()
  const account = useStore((s) => s.account)
  const [entries, setEntries] = useState<StampBookEntry[] | null>(null)
  const startGuard = useEffectGuard()

  useEffect(() => {
    const isCurrent = startGuard()
    getStampBook(username, account?.token).then((res) => {
      if (isCurrent() && res.ok) setEntries(res.data)
    })
  }, [username, account?.token])

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to={`/o/${username}`} className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to profile
      </Link>
      <div>
        <h1 className="font-serif text-2xl leading-none">Stamps</h1>
        <p className="mt-1 text-xs text-ink-faint">@{username}'s collection, one ink stamp per completed prompt.</p>
      </div>

      {entries === null ? (
        <LoadingMark />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {entries.map((entry) => (
            <div
              key={entry.category}
              className="flex flex-col items-center gap-2 rounded-sm border border-line bg-card px-3 py-4 text-center"
            >
              <Stamp category={entry.category} seed={`book-${entry.category}`} size={26} locked={!entry.earned} />
              <p className="text-xs font-medium leading-tight">{CATEGORY_META[entry.category].label}</p>
              <p className="text-[11px] text-ink-faint">{entry.earned ? `${entry.count} earned` : 'Not earned yet'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
