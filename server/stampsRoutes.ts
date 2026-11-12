import { Router } from 'express'
import { resolveOptionalAccountId } from './auth.js'
import { getAccountByUsername } from './accountsRepo.js'
import { getStampBook } from './stampsRepo.js'

export const stampsRouter = Router()

// Public (optionally-authenticated) like a profile page itself — the
// visibility narrowing happens per-completion inside getStampBook, not at
// this route, so a signed-out visitor or a stranger still gets a response,
// just one where locked/zero-count entries stand in for anything they're
// not allowed to see.
stampsRouter.get('/api/accounts/:username/stamps', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const account = getAccountByUsername(String(req.params.username))
  if (!account) return res.status(404).json({ errors: { form: 'No account with that username.' } })
  res.json(getStampBook(account.id, viewerId))
})
