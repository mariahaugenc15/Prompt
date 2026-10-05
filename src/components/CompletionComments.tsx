import { useEffect, useState } from 'react'
import { getComments, postComment, deleteComment, type CommentView } from '../lib/commentsApi'
import { ReportButton } from './ReportButton'

// Shared by DayDetailSheet (collapsed behind a count, by default) and
// CompletionDetailModal (alwaysExpanded — "the full comment thread" the
// tap-to-expand view is meant to show).
export function CompletionComments({
  completionId,
  token,
  alwaysExpanded = false,
}: {
  completionId: string
  token?: string
  alwaysExpanded?: boolean
}) {
  const [comments, setComments] = useState<CommentView[]>([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(alwaysExpanded)

  useEffect(() => {
    getComments(completionId, token).then((res) => {
      if (res.ok) setComments(res.data)
    })
  }, [completionId, token])

  async function handleSubmit() {
    if (!token || !text.trim()) return
    setSubmitting(true)
    try {
      const res = await postComment(completionId, text.trim(), token)
      if (res.ok) {
        setComments((prev) => [...prev, res.data])
        setText('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(commentId: string) {
    if (!token) return
    const res = await deleteComment(commentId, token)
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      {!alwaysExpanded && comments.length > 0 && (
        <button onClick={() => setExpanded((v) => !v)} className="mb-1.5 text-xs text-ink-faint underline underline-offset-2">
          {expanded ? 'Hide' : `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}
        </button>
      )}
      {alwaysExpanded && (
        <p className="mb-1.5 text-xs uppercase tracking-wider text-ink-faint">
          {comments.length === 0 ? 'No comments yet' : `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}
        </p>
      )}
      {expanded && (
        <div className="mb-2 flex flex-col gap-1.5">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 rounded-sm bg-paper-dim px-2.5 py-1.5">
              <p className="text-xs text-ink-soft">
                <span className="font-medium text-ink">@{c.authorUsername}</span> {c.text}
              </p>
              {c.isMine ? (
                <button onClick={() => handleDelete(c.id)} className="shrink-0 text-[11px] text-ink-faint underline underline-offset-2">
                  Delete
                </button>
              ) : (
                <ReportButton targetType="comment" targetId={c.id} token={token} className="shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
      {token && (
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-full border border-line bg-paper px-3 py-1.5 text-xs outline-none focus:border-line-strong"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="shrink-0 rounded-full border border-ink px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Post
          </button>
        </div>
      )}
    </div>
  )
}
