import { Router } from 'express'
import crypto from 'node:crypto'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import {
  createBoard,
  getBoardById,
  getBoardsForAccount,
  listDiscoverable,
  publicBoardView,
  searchBoards,
  subscribe,
} from './boardsRepo.js'
import { getAccountByUsername } from './accountsRepo.js'

export const boardsRouter = Router()

const CATEGORIES = ['brand', 'nonprofit', 'creator', 'local', 'interest']
const VISIBILITIES = ['public', 'invite']

function validateBoardBody(body: unknown): { name: string; description: string; category: string; visibility: string; locationTag?: string } | { error: Record<string, string> } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const category = typeof b.category === 'string' ? b.category : ''
  const visibility = typeof b.visibility === 'string' ? b.visibility : ''
  const locationTag = typeof b.locationTag === 'string' && b.locationTag.trim() ? b.locationTag.trim() : undefined

  const errors: Record<string, string> = {}
  if (!name) errors.name = 'Board name is required.'
  if (!CATEGORIES.includes(category)) errors.category = `Category must be one of: ${CATEGORIES.join(', ')}.`
  if (!VISIBILITIES.includes(visibility)) errors.visibility = `Visibility must be one of: ${VISIBILITIES.join(', ')}.`
  if (Object.keys(errors).length > 0) return { error: errors }

  return { name, description, category, visibility, locationTag }
}

// GET /api/boards/discover — public boards you haven't joined yet, most
// recent first. Anyone can browse this, signed in or not.
boardsRouter.get('/api/boards/discover', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  res.json(listDiscoverable(viewerId, limit).map((b) => publicBoardView(b, viewerId)))
})

// GET /api/search/boards?q=foo — public boards only, matching name or
// description. A private board never appears here, same as Discover.
boardsRouter.get('/api/search/boards', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  const viewerId = resolveOptionalAccountId(req)
  res.json(searchBoards(q, 12).map((b) => publicBoardView(b, viewerId)))
})

// GET /api/boards/mine — boards you own or have joined.
boardsRouter.get('/api/boards/mine', requireAuth, (req, res) => {
  const me = req.account!
  res.json(getBoardsForAccount(me.id).map((b) => publicBoardView(b, me.id)))
})

boardsRouter.post('/api/boards', requireAuth, (req, res) => {
  const me = req.account!
  const parsed = validateBoardBody(req.body)
  if ('error' in parsed) return res.status(422).json({ errors: parsed.error })

  const id = crypto.randomUUID()
  createBoard({
    id,
    ownerAccountId: me.id,
    name: parsed.name,
    description: parsed.description,
    category: parsed.category,
    visibility: parsed.visibility as 'public' | 'invite',
    locationTag: parsed.locationTag,
    createdAt: Date.now(),
  })

  const board = getBoardById(id)!
  res.status(201).json(publicBoardView(board, me.id))
})

boardsRouter.get('/api/boards/:id', (req, res) => {
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })

  const viewerId = resolveOptionalAccountId(req)
  const view = publicBoardView(board, viewerId)
  // A private board's existence is only visible to its own members —
  // everyone else gets the same 404 as a board that doesn't exist at all.
  if (board.visibility === 'invite' && !view.isOwner && !view.isSubscribed) {
    return res.status(404).json({ errors: { form: 'No board with that id.' } })
  }
  res.json(view)
})

boardsRouter.post('/api/boards/:id/subscribe', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.visibility !== 'public') {
    return res.status(403).json({ errors: { form: 'This board is invite-only — ask the owner to add you.' } })
  }
  subscribe(board.id, me.id)
  res.json(publicBoardView(board, me.id))
})

// Direct-add, owner only — mirrors how simple inviting someone to a private
// group should be: no request/accept dance, the owner just adds them.
boardsRouter.post('/api/boards/:id/invite', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== me.id) {
    return res.status(403).json({ errors: { form: 'Only the board owner can invite people.' } })
  }
  const username = String(req.body?.username ?? '')
  const target = getAccountByUsername(username)
  if (!target) return res.status(404).json({ errors: { username: 'No account with that username.' } })

  subscribe(board.id, target.id)
  res.status(201).json(publicBoardView(board, me.id))
})
