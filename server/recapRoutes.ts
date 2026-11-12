import { Router } from 'express'
import { requireAuth } from './auth.js'
import { getRecap, monthHasEnded } from './recapRepo.js'

export const recapRouter = Router()

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

recapRouter.get('/api/recap/:monthKey', requireAuth, (req, res) => {
  const monthKey = String(req.params.monthKey)
  if (!MONTH_KEY_RE.test(monthKey)) {
    return res.status(422).json({ errors: { form: 'Invalid month.' } })
  }
  if (!monthHasEnded(monthKey)) {
    return res.status(422).json({ errors: { form: "That month isn't over yet." } })
  }
  const recap = getRecap(req.account!.id, monthKey)
  res.json(recap)
})
