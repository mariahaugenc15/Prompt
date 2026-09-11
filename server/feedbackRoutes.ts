import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import { requireAuth } from './auth.js'

export const feedbackRouter = Router()

const MAX_FEEDBACK_LENGTH = 2000
const insertFeedback = db.prepare(`
  INSERT INTO feedback (id, account_id, email, message, created_at)
  VALUES (@id, @accountId, @email, @message, @createdAt)
`)

// Open-ended, not tied to any post/account — a direct line to the people
// running the app. email is the authenticated account's own, same
// reasoning as reports (see moderationRoutes.ts): a real address to follow
// up on, not something the client could fake.
feedbackRouter.post('/api/feedback', requireAuth, (req, res) => {
  const me = req.account!
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message) return res.status(422).json({ errors: { message: 'Please write your feedback first.' } })
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return res.status(422).json({ errors: { message: `Feedback must be ${MAX_FEEDBACK_LENGTH} characters or fewer.` } })
  }

  insertFeedback.run({ id: crypto.randomUUID(), accountId: me.id, email: me.email, message, createdAt: Date.now() })
  res.status(201).json({ ok: true })
})
