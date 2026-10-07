import { Router } from 'express'
import { requireAuth } from './auth.js'
import { getInboxItems } from './promptRoutes.js'
import { myActivity } from './completionsRepo.js'
import { saveApnsToken, removeApnsToken } from './apnsRepo.js'

export const widgetRouter = Router()

// GET /api/widget/snapshot: a compact payload the native iOS app's
// WidgetBridge plugin pulls (on launch, after a manual refresh request
// from the web view, or when a silent APNs push wakes the app in the
// background) to populate the home-screen widget's "post-it notes": the
// native widget extension has no access to this app's own API client or
// auth store, so it reads a cached copy of this response from the shared
// App Group container instead of calling this endpoint directly. This is
// deliberately a thin reshaping of the same inbox/activity queries the
// in-app screens already use, not a parallel data model.
widgetRouter.get('/api/widget/snapshot', requireAuth, (req, res) => {
  const me = req.account!

  const waiting = getInboxItems(me.id)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      category: item.category,
      text: item.text,
      fromDisplayName: item.senderDisplayName,
      boardName: item.boardName ?? null,
      createdAt: item.createdAt,
    }))

  const completed = myActivity(me.id, 5, 0).map((c) => ({
    id: c.id,
    category: c.category,
    caption: c.userCaption ?? c.autoCaption ?? c.text,
    createdAt: c.createdAt,
  }))

  res.json({ waiting, completed, fetchedAt: Date.now() })
})

widgetRouter.post('/api/widget/apns-register', requireAuth, (req, res) => {
  const token = typeof req.body?.deviceToken === 'string' ? req.body.deviceToken.trim() : ''
  // APNs device tokens are 64 hex characters (32 bytes) as of the current
  // token format Apple hands back from registerForRemoteNotifications.
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return res.status(422).json({ errors: { form: 'A valid device token is required.' } })
  }
  saveApnsToken(req.account!.id, token.toLowerCase())
  res.status(201).json({ ok: true })
})

widgetRouter.post('/api/widget/apns-unregister', requireAuth, (req, res) => {
  const token = typeof req.body?.deviceToken === 'string' ? req.body.deviceToken.trim().toLowerCase() : ''
  if (token) removeApnsToken(token)
  res.json({ ok: true })
})
