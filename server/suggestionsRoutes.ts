import { Router } from 'express'
import { requireAuth } from './auth.js'
import { getRandomSuggestion } from './suggestionsRepo.js'

export const suggestionsRouter = Router()

const CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug']
const PACKS = ['chill', 'brave', 'silly', 'outdoors']

// Powers the "Need an idea?" shuffle button on Send a prompt and on a
// board's Broadcast a challenge form. Requires sign-in like every other
// read in the app, but otherwise has no permission check of its own: a
// suggestion is static library content, not anyone's data.
suggestionsRouter.get('/api/suggestions', requireAuth, (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : ''
  const pack = typeof req.query.pack === 'string' ? req.query.pack : ''
  if (!CATEGORIES.includes(category)) {
    return res.status(422).json({ errors: { category: `Category must be one of: ${CATEGORIES.join(', ')}.` } })
  }
  if (!PACKS.includes(pack)) {
    return res.status(422).json({ errors: { pack: `Pack must be one of: ${PACKS.join(', ')}.` } })
  }
  const excludeIds =
    typeof req.query.exclude === 'string'
      ? req.query.exclude.split(',').map((s) => s.trim()).filter(Boolean)
      : []
  const suggestion = getRandomSuggestion(category, pack, excludeIds)
  if (!suggestion) return res.status(404).json({ errors: { form: 'No suggestions available for that combination yet.' } })
  res.json(suggestion)
})
