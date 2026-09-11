import { useState } from 'react'
import { reportContent } from '../lib/realAccountsApi'

// A small "report this" link + inline reason box. Submitting always uses
// the reporter's own account email server-side (never asked for here) so
// there's a real way to follow up — see server/moderationRoutes.ts.
export function ReportButton({
  targetType,
  targetId,
  token,
  className,
}: {
  targetType: 'account' | 'completion' | 'board' | 'comment'
  targetId: string
  token?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)

  async function submit() {
    if (!token || !reason.trim()) return
    const res = await reportContent({ targetType, targetId, reason: reason.trim() }, token)
    if (res.ok) {
      setSent(true)
      setOpen(false)
      setReason('')
    }
  }

  if (!token) return null
  if (sent) return <span className={`text-xs text-ink-faint ${className ?? ''}`}>Reported</span>

  return (
    <div className={`relative ${className ?? ''}`}>
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-ink-faint underline underline-offset-2">
        Report
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-56 rounded-sm border border-line bg-card p-2.5 shadow-note" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="What's wrong with this?"
            className="w-full resize-none rounded-sm border border-line bg-paper p-1.5 text-xs outline-none focus:border-line-strong"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button onClick={submit} disabled={!reason.trim()} className="rounded-sm bg-ink px-2 py-1 text-[11px] font-medium text-paper disabled:bg-line">
              Submit
            </button>
            <button onClick={() => setOpen(false)} className="rounded-sm border border-line px-2 py-1 text-[11px] text-ink-soft">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
