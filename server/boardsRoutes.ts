import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import { requireAuth, resolveOptionalAccountId } from './auth.js'
import {
  createBoard,
  getBoardById,
  getBoardsForAccount,
  getSubscriberIds,
  getTopFans,
  listDiscoverable,
  publicBoardView,
  searchBoards,
  setBoardAdultFlag,
  setBoardTopFansPublic,
  subscribe,
} from './boardsRepo.js'
import { getAccountByUsername, hasOptedIntoAdultContent } from './accountsRepo.js'
import { notifyForEvent } from './notificationsRepo.js'
import { reactionCounts } from './reactionsRepo.js'
import { blockedEitherWayIds } from './blocksRepo.js'

export const boardsRouter = Router()

const CATEGORIES = ['brand', 'nonprofit', 'creator', 'local', 'interest']
const VISIBILITIES = ['public', 'invite']
const PROMPT_CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug']
const CADENCES = ['one-off', 'daily', 'weekly']

function validateBoardBody(body: unknown): { name: string; description: string; category: string; visibility: string; locationTag?: string; icon?: string; isAdult: boolean } | { error: Record<string, string> } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const category = typeof b.category === 'string' ? b.category : ''
  const visibility = typeof b.visibility === 'string' ? b.visibility : ''
  const locationTag = typeof b.locationTag === 'string' && b.locationTag.trim() ? b.locationTag.trim() : undefined
  const icon = typeof b.icon === 'string' && b.icon.trim() ? b.icon.trim() : undefined
  const isAdult = b.isAdult === true

  const errors: Record<string, string> = {}
  if (!name) errors.name = 'Board name is required.'
  if (!CATEGORIES.includes(category)) errors.category = `Category must be one of: ${CATEGORIES.join(', ')}.`
  if (!VISIBILITIES.includes(visibility)) errors.visibility = `Visibility must be one of: ${VISIBILITIES.join(', ')}.`
  if (Object.keys(errors).length > 0) return { error: errors }

  return { name, description, category, visibility, locationTag, icon, isAdult }
}

// GET /api/boards/discover — public boards you haven't joined yet, most
// recent first. Anyone can browse this, signed in or not.
boardsRouter.get('/api/boards/discover', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  res.json(listDiscoverable(viewerId, limit, offset).map((b) => publicBoardView(b, viewerId)))
})

// GET /api/search/boards?q=foo — public boards only, matching name or
// description. A private board never appears here, same as Discover.
boardsRouter.get('/api/search/boards', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  const viewerId = resolveOptionalAccountId(req)
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  res.json(searchBoards(q, viewerId, limit, offset).map((b) => publicBoardView(b, viewerId)))
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
    icon: parsed.icon,
    isAdult: parsed.isAdult,
    createdAt: Date.now(),
  })

  const board = getBoardById(id)!
  res.status(201).json(publicBoardView(board, me.id))
})

// Owner- or admin-only — an adult-flagged board can never be silently
// un-flagged by anyone else (e.g. another subscriber), matching the
// brief. Admin access is checked the same way adminRoutes.ts does
// (req.account.isAdmin), just inline here rather than behind a whole
// separate admin-only router, since an owner can hit this route too.
boardsRouter.patch('/api/boards/:id/adult-flag', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== me.id && !me.isAdmin) {
    return res.status(403).json({ errors: { form: 'Only the board owner or an admin can change this.' } })
  }
  const isAdult = Boolean(req.body?.isAdult)
  setBoardAdultFlag(board.id, isAdult)
  res.json(publicBoardView(getBoardById(board.id)!, me.id))
})

// --- Top Fans (owner-facing subscriber leaderboard) -----------------------

boardsRouter.patch('/api/boards/:id/top-fans-visibility', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== me.id) {
    return res.status(403).json({ errors: { form: 'Only the board owner can change this.' } })
  }
  setBoardTopFansPublic(board.id, Boolean(req.body?.isPublic))
  res.json(publicBoardView(getBoardById(board.id)!, me.id))
})

// Ranked across every board this owner runs, not just this one — see
// boardsRepo.ts's getTopFans(). Always visible to the owner; to anyone
// else only once the owner has turned Top Fans public on this board.
boardsRouter.get('/api/boards/:id/top-fans', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== me.id && !board.top_fans_public) {
    return res.status(403).json({ errors: { form: 'Top Fans is owner-only for this board.' } })
  }
  res.json(getTopFans(board.owner_account_id))
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
  if (board.is_adult && !view.isOwner && (!viewerId || !hasOptedIntoAdultContent(viewerId))) {
    return res.status(403).json({ errors: { form: 'This board is marked 18+. Opt in to adult content in your settings first.' } })
  }
  res.json(view)
})

boardsRouter.post('/api/boards/:id/subscribe', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.visibility !== 'public') {
    return res.status(403).json({ errors: { form: 'This board is invite-only. Ask the owner to add you.' } })
  }
  if (board.is_adult && !hasOptedIntoAdultContent(me.id)) {
    return res.status(403).json({ errors: { form: 'This board is marked 18+. Opt in to adult content in your settings first.' } })
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

// --- Board challenges (broadcasts scoped to a board's subscribers) -------
// Same underlying mechanic as an organization broadcast (one prompt row,
// many prompt_completions rows) — just gated by board subscription instead
// of a follow, and the owner is allowed to complete their own board's
// challenge since they're a normal subscriber too, not the account posting
// it as itself the way an organization is.

const insertChallenge = db.prepare(`
  INSERT INTO prompts (id, sender_account_id, recipient_account_id, is_broadcast, category, prompt_text, status, board_id, cadence, created_at)
  VALUES (@id, @senderAccountId, NULL, 1, @category, @text, 'active', @boardId, @cadence, @createdAt)
`)

boardsRouter.post('/api/boards/:id/challenges', requireAuth, (req, res) => {
  const me = req.account!
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  if (board.owner_account_id !== me.id) {
    return res.status(403).json({ errors: { form: 'Only the board owner can post a challenge.' } })
  }

  const category = typeof req.body?.category === 'string' ? req.body.category : ''
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  const cadence = typeof req.body?.cadence === 'string' && CADENCES.includes(req.body.cadence) ? req.body.cadence : 'one-off'
  if (!PROMPT_CATEGORIES.includes(category)) {
    return res.status(422).json({ errors: { category: `Category must be one of: ${PROMPT_CATEGORIES.join(', ')}.` } })
  }
  if (!text) return res.status(422).json({ errors: { text: 'Challenge text is required.' } })

  const id = crypto.randomUUID()
  insertChallenge.run({ id, senderAccountId: me.id, category, text, boardId: board.id, cadence, createdAt: Date.now() })

  for (const subscriberId of getSubscriberIds(board.id)) {
    if (subscriberId === me.id) continue
    notifyForEvent(subscriberId, 'new_prompt', `${board.name} posted a new challenge`, text)
  }

  res.status(201).json({ id, category, text, cadence, status: 'active', boardId: board.id })
})

const challengesForBoard = db.prepare(`
  SELECT id, category, prompt_text AS text, cadence, created_at AS createdAt
  FROM prompts WHERE board_id = ? AND is_broadcast = 1
  ORDER BY created_at DESC
`)
const completionsForChallenge = db.prepare(`
  SELECT c.id, c.auto_caption AS autoCaption, c.user_caption AS userCaption, c.media_type AS mediaType,
         c.media_data_url AS mediaDataUrl, c.created_at AS createdAt, a.username AS completerUsername
  FROM prompt_completions c
  JOIN accounts a ON a.id = c.completer_account_id
  WHERE c.prompt_id = ?
  ORDER BY c.created_at DESC
`)

// GET /api/boards/discover/challenges — recent challenges from public
// boards, for browsing before you've subscribed to anything. Registered
// before /api/boards/:id below only for readability — the extra path
// segment already keeps it from colliding either way.
const recentPublicChallenges = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.cadence, p.created_at AS createdAt,
         b.id AS boardId, b.name AS boardName, b.icon AS boardIcon, b.owner_account_id AS ownerAccountId,
         a.username AS ownerUsername, a.first_name AS ownerFirstName, a.organization_name AS ownerOrgName
  FROM prompts p
  JOIN boards b ON b.id = p.board_id
  JOIN accounts a ON a.id = b.owner_account_id
  WHERE p.is_broadcast = 1 AND b.visibility = 'public' AND (b.is_adult = 0 OR ? = 1)
  ORDER BY p.created_at DESC
  LIMIT ? OFFSET ?
`)

boardsRouter.get('/api/boards/discover/challenges', (req, res) => {
  const viewerId = resolveOptionalAccountId(req)
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const adultOk = viewerId && hasOptedIntoAdultContent(viewerId) ? 1 : 0
  const overfetch = limit + (viewerId ? blockedEitherWayIds(viewerId).size : 0)
  const blocked = viewerId ? blockedEitherWayIds(viewerId) : undefined
  const rows = (recentPublicChallenges.all(adultOk, overfetch, offset) as Record<string, unknown>[])
    .filter((r) => !blocked || !blocked.has(r.ownerAccountId as string))
    .slice(0, limit)
  res.json(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      text: r.text,
      cadence: r.cadence,
      createdAt: r.createdAt,
      boardId: r.boardId,
      boardName: r.boardName,
      boardIcon: r.boardIcon ?? undefined,
      ownerDisplayName: (r.ownerOrgName as string | null) || (r.ownerFirstName as string | null) || (r.ownerUsername as string),
    })),
  )
})

boardsRouter.get('/api/boards/:id/challenges', (req, res) => {
  const board = getBoardById(String(req.params.id))
  if (!board) return res.status(404).json({ errors: { form: 'No board with that id.' } })
  const viewerId = resolveOptionalAccountId(req)
  if (board.visibility === 'invite' && (!viewerId || (board.owner_account_id !== viewerId && !getSubscriberIds(board.id).includes(viewerId)))) {
    return res.status(404).json({ errors: { form: 'No board with that id.' } })
  }
  const isOwner = viewerId === board.owner_account_id
  if (board.is_adult && !isOwner && (!viewerId || !hasOptedIntoAdultContent(viewerId))) {
    return res.status(403).json({ errors: { form: 'This board is marked 18+. Opt in to adult content in your settings first.' } })
  }

  const challenges = (challengesForBoard.all(board.id) as Record<string, unknown>[]).map((c) => {
    const completions = (completionsForChallenge.all(c.id) as Record<string, unknown>[]).map((completion) => ({
      ...completion,
      ...reactionCounts(String(completion.id), viewerId),
    }))
    return { ...c, participationCount: completions.length, completions }
  })
  res.json(challenges)
})
