import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon } from '../components/Icons'
import { getRecap, type RecapData } from '../lib/recapApi'
import { renderRecapCanvas, type RecapAspect } from '../lib/recapImage'
import { shareRecapCanvas } from '../lib/recapShare'
import { useEffectGuard } from '../lib/useEffectGuard'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function MonthlyRecap() {
  const { monthKey } = useParams<{ monthKey: string }>()
  const account = useStore((s) => s.account)
  const [recap, setRecap] = useState<RecapData | null | undefined>(undefined)
  const [aspect, setAspect] = useState<RecapAspect>('9:16')
  const [sharing, setSharing] = useState(false)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const startGuard = useEffectGuard()

  useEffect(() => {
    if (!account || !monthKey) return
    const isCurrent = startGuard()
    getRecap(monthKey, account.token).then((data) => {
      if (isCurrent()) setRecap(data ?? null)
    })
    // startGuard intentionally excluded — see GroupDetail.tsx's identical
    // comment; including it here caused the exact same infinite-refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, monthKey])

  useEffect(() => {
    if (!recap || !previewRef.current) return
    const canvas = renderRecapCanvas(recap, aspect)
    const ctx = previewRef.current.getContext('2d')
    previewRef.current.width = canvas.width
    previewRef.current.height = canvas.height
    ctx?.drawImage(canvas, 0, 0)
  }, [recap, aspect])

  async function handleShare() {
    if (!recap) return
    setSharing(true)
    try {
      const canvas = renderRecapCanvas(recap, aspect)
      await shareRecapCanvas(canvas, `prompt-recap-${recap.monthKey}.png`)
    } finally {
      setSharing(false)
    }
  }

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to see your recap.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to="/" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back
      </Link>

      {recap === undefined && <p className="p-6 text-center text-sm text-ink-faint">Loading your recap...</p>}

      {recap === null && (
        <p className="p-6 text-center text-sm text-ink-faint">That recap isn't ready yet. Check back once the month is over.</p>
      )}

      {recap && (
        <>
          <div>
            <h1 className="font-serif text-2xl">{monthLabel(recap.monthKey)}</h1>
            <p className="text-xs text-ink-faint">Your Prompt recap</p>
          </div>

          {recap.thin ? (
            <div className="rounded-sm border border-dashed border-line bg-card p-6 text-center">
              <p className="font-serif text-lg leading-snug">
                {recap.totalCompletions === 0
                  ? 'A quiet month. Every month counts, even the slow ones.'
                  : `A quieter month, ${recap.totalCompletions} completion${recap.totalCompletions === 1 ? '' : 's'} and counting.`}
              </p>
              <p className="mt-2 text-sm text-ink-faint">See you next month.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Completions" value={String(recap.totalCompletions)} />
              <StatCard label="Completion score" value={recap.completionScore === null ? 'N/A' : `${recap.completionScore}%`} />
              <StatCard
                label="Favorite category"
                value={recap.favoriteCategory ? CATEGORY_META[recap.favoriteCategory as Category]?.label ?? recap.favoriteCategory : 'N/A'}
                icon={recap.favoriteCategory ? <CATEGORY_ICON category={recap.favoriteCategory} size={16} /> : undefined}
              />
              <StatCard label="Longest streak" value={`${recap.longestStreakDays} day${recap.longestStreakDays === 1 ? '' : 's'}`} />
              {recap.topFriend && (
                <div className="col-span-2 rounded-sm border border-line bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Exchanged the most prompts with</p>
                  <p className="mt-1 font-serif text-lg">@{recap.topFriend.username}</p>
                </div>
              )}
              {recap.mostLaughedAt && (
                <div className="col-span-2 rounded-sm border border-line bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Most laughed at</p>
                  <p className="mt-1 font-serif text-base italic leading-snug">"{recap.mostLaughedAt.text}"</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-sm border border-line bg-card p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Share your recap</p>
            <p className="mb-2 text-[11px] text-ink-faint">Only your own numbers go in the shared image.</p>
            <div className="mb-3 flex gap-2">
              {(['9:16', '1:1'] as RecapAspect[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-xs',
                    aspect === a ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="mb-3 flex justify-center overflow-hidden rounded-sm border border-line">
              <canvas ref={previewRef} className="h-auto w-full max-w-[240px]" />
            </div>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="w-full rounded-sm bg-ink py-2.5 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
            >
              {sharing ? 'Preparing...' : 'Share'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-serif text-xl text-accent">
        {icon}
        {value}
      </p>
    </div>
  )
}
