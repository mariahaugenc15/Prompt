import { Router } from 'express'
import crypto from 'node:crypto'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import {
  createCalendar,
  getCalendarById,
  isMember,
  join,
  leave,
  listDiscoverable,
  listMine,
  memberIds,
  publicCalendarView,
  setVisibility,
  tagCompletion,
} from './calendarsRepo.js'
import { calendarFeed, ownedCompletion } from './completionsRepo.js'
import { getAccountById, displayName } from './accountsRepo.js'

export const calendarsRouter = Router()

calendarsRouter.post('/api/calendars', requireAuth, (req, res) => {
  const me = req.account!
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const visibility = req.body?.visibility === 'public' ? 'public' : 'private'
  if (!name) return res.status(422).json({ errors: { name: 'Calendar name is required.' } })

  const id = crypto.randomUUID()
  createCalendar({ id, ownerAccountId: me.id, name, visibility, createdAt: Date.now() })
  res.status(201).json(publicCalendarView(getCalendarById(id)!, me.id))
})

calendarsRouter.get('/api/calendars/mine', requireAuth, (req, res) => {
  const me = req.account!
  res.json(listMine(me.id).map((c) => publicCalendarView(c, me.id)))
})

calendarsRouter.get('/api/calendars/discover', requireAuth, (req, res) => {
  const me = req.account!
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  res.json(listDiscoverable(me.id, limit).map((c) => publicCalendarView(c, me.id)))
})

calendarsRouter.get('/api/calendars/:id', (req, res) => {
  const calendar = getCalendarById(String(req.params.id))
  if (!calendar) return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  const viewerId = resolveOptionalAccountId(req)
  const view = publicCalendarView(calendar, viewerId)
  if (calendar.visibility === 'private' && !view.isMember) {
    return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  }
  res.json({
    ...view,
    members: memberIds(calendar.id).map((id) => {
      const account = getAccountById(id)
      return { id, username: account?.username, displayName: account ? displayName(account) : 'Someone' }
    }),
  })
})

calendarsRouter.get('/api/calendars/:id/feed', (req, res) => {
  const calendar = getCalendarById(String(req.params.id))
  if (!calendar) return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  const viewerId = resolveOptionalAccountId(req)
  if (calendar.visibility === 'private' && (!viewerId || !isMember(calendar.id, viewerId))) {
    return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  }
  res.json(calendarFeed(calendar.id, viewerId))
})

calendarsRouter.post('/api/calendars/:id/join', requireAuth, (req, res) => {
  const me = req.account!
  const calendar = getCalendarById(String(req.params.id))
  if (!calendar) return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  if (calendar.visibility !== 'public') {
    return res.status(403).json({ errors: { form: 'This calendar is private.' } })
  }
  join(calendar.id, me.id)
  res.json(publicCalendarView(calendar, me.id))
})

calendarsRouter.post('/api/calendars/:id/leave', requireAuth, (req, res) => {
  const me = req.account!
  const calendar = getCalendarById(String(req.params.id))
  if (!calendar) return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  if (calendar.owner_account_id === me.id) {
    return res.status(422).json({ errors: { form: 'The owner cannot leave their own calendar.' } })
  }
  leave(calendar.id, me.id)
  res.json(publicCalendarView(calendar, me.id))
})

calendarsRouter.patch('/api/calendars/:id/visibility', requireAuth, (req, res) => {
  const me = req.account!
  const calendar = getCalendarById(String(req.params.id))
  if (!calendar) return res.status(404).json({ errors: { form: 'No calendar with that id.' } })
  const visibility = req.body?.visibility === 'public' ? 'public' : req.body?.visibility === 'private' ? 'private' : undefined
  if (!visibility) return res.status(422).json({ errors: { visibility: 'Visibility must be "public" or "private".' } })
  const changed = setVisibility(calendar.id, me.id, visibility)
  if (!changed) return res.status(403).json({ errors: { form: 'Only the calendar owner can change its visibility.' } })
  res.json(publicCalendarView(getCalendarById(calendar.id)!, me.id))
})

// Tag one of your own completions into a set of calendars you belong to —
// replaces the full tag set each time, same as picking checkboxes.
calendarsRouter.post('/api/completions/:id/calendars', requireAuth, (req, res) => {
  const me = req.account!
  const owned = ownedCompletion(String(req.params.id), me.id)
  if (!owned) return res.status(403).json({ errors: { form: 'You can only file your own completions.' } })

  const calendarIds = Array.isArray(req.body?.calendarIds) ? req.body.calendarIds.filter((id: unknown) => typeof id === 'string') : []
  const validIds = calendarIds.filter((id: string) => isMember(id, me.id))
  tagCompletion(String(req.params.id), validIds)
  res.json({ calendarIds: validIds })
})
