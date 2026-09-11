import { Router } from 'express'
import { requireAuth } from './auth.js'
import { removeSubscription, saveSubscription, vapidPublicKey } from './pushRepo.js'

export const pushRouter = Router()

pushRouter.get('/api/push/public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey() })
})

pushRouter.post('/api/push/subscribe', requireAuth, (req, res) => {
  const me = req.account!
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  const keys = req.body?.keys as { p256dh?: unknown; auth?: unknown } | undefined
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh : ''
  const auth = typeof keys?.auth === 'string' ? keys.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return res.status(422).json({ errors: { form: 'A valid push subscription is required.' } })
  }
  saveSubscription(me.id, { endpoint, keys: { p256dh, auth } })
  res.status(201).json({ ok: true })
})

pushRouter.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  if (endpoint) removeSubscription(endpoint)
  res.json({ ok: true })
})
