import { Router } from 'express'
import { requireAuth } from './auth.js'
import {
  getNotificationPrefs,
  setNotificationPrefs,
  listNotifications,
  unreadNotificationCount,
  markAllNotificationsRead,
  type NotificationPrefs,
} from './notificationsRepo.js'

export const notificationsRouter = Router()

notificationsRouter.get('/api/me/notification-prefs', requireAuth, (req, res) => {
  res.json(getNotificationPrefs(req.account!.id))
})

notificationsRouter.patch('/api/me/notification-prefs', requireAuth, (req, res) => {
  const body = req.body as Partial<NotificationPrefs>
  const current = getNotificationPrefs(req.account!.id)
  const next: NotificationPrefs = {
    master: typeof body.master === 'boolean' ? body.master : current.master,
    newFollower: typeof body.newFollower === 'boolean' ? body.newFollower : current.newFollower,
    newPrompt: typeof body.newPrompt === 'boolean' ? body.newPrompt : current.newPrompt,
    promptCompleted: typeof body.promptCompleted === 'boolean' ? body.promptCompleted : current.promptCompleted,
  }
  setNotificationPrefs(req.account!.id, next)
  res.json(next)
})

function pagination(req: import('express').Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  return { limit, offset }
}

notificationsRouter.get('/api/notifications', requireAuth, (req, res) => {
  const { limit, offset } = pagination(req)
  res.json({
    items: listNotifications(req.account!.id, limit, offset),
    unreadCount: unreadNotificationCount(req.account!.id),
  })
})

notificationsRouter.post('/api/notifications/read', requireAuth, (req, res) => {
  markAllNotificationsRead(req.account!.id)
  res.json({ ok: true })
})
