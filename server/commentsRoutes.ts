import { Router } from 'express'
import crypto from 'node:crypto'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import { addComment, getCommentById, listComments, removeComment } from './commentsRepo.js'
import { notifyAccount } from './pushRepo.js'
import { db } from './db.js'

export const commentsRouter = Router()

const MAX_COMMENT_LENGTH = 500

commentsRouter.get('/api/completions/:id/comments', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  res.json(listComments(String(req.params.id), viewerId))
})

// Best-effort lookup of who to notify about a new comment: whoever
// completed the post, and (for a 1:1) whoever sent it — skipped if
// neither row exists, which just means an unrecognized completion id.
const completerOfOneToOne = db.prepare('SELECT sender_account_id, recipient_account_id FROM prompts WHERE id = ?')
const completerOfBroadcast = db.prepare(`
  SELECT p.sender_account_id, c.completer_account_id
  FROM prompt_completions c JOIN prompts p ON p.id = c.prompt_id
  WHERE c.id = ?
`)

commentsRouter.post('/api/completions/:id/comments', requireAuth, (req, res) => {
  const me = req.account!
  const completionId = String(req.params.id)
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(422).json({ errors: { text: 'Comment cannot be empty.' } })
  if (text.length > MAX_COMMENT_LENGTH) {
    return res.status(422).json({ errors: { text: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.` } })
  }

  const id = crypto.randomUUID()
  addComment({ id, completionId, accountId: me.id, text, createdAt: Date.now() })

  const oneToOne = completerOfOneToOne.get(completionId) as { sender_account_id: string; recipient_account_id: string | null } | undefined
  const broadcast = completerOfBroadcast.get(completionId) as { sender_account_id: string; completer_account_id: string } | undefined
  const notifyIds = new Set(
    [oneToOne?.sender_account_id, oneToOne?.recipient_account_id, broadcast?.sender_account_id, broadcast?.completer_account_id].filter(
      (v): v is string => Boolean(v) && v !== me.id,
    ),
  )
  for (const accountId of notifyIds) {
    notifyAccount(accountId, `${me.displayName} commented`, text)
  }

  const [comment] = listComments(completionId, me.id).filter((c) => c.id === id)
  res.status(201).json(comment)
})

commentsRouter.delete('/api/comments/:id', requireAuth, (req, res) => {
  const me = req.account!
  const comment = getCommentById(String(req.params.id))
  if (!comment || comment.is_removed) return res.status(404).json({ errors: { form: 'Comment not found.' } })
  if (comment.account_id !== me.id) {
    return res.status(403).json({ errors: { form: 'You can only delete your own comment.' } })
  }
  removeComment(comment.id)
  res.json({ id: comment.id })
})
