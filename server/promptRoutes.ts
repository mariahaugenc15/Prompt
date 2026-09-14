import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { canBroadcast, canCompleteBroadcast, canReceiveOneToOne, canSendOneToOne } from './permissions.js'
import { displayName, getAccountById, getAccountByUsername, isFollowing } from './accountsRepo.js'
import { isSubscribed } from './boardsRepo.js'
import { reactionCounts, toggleReaction } from './reactionsRepo.js'
import { notifyAccount } from './pushRepo.js'
import { publicBaseUrl, saveDataUrlAsFile } from './mediaStore.js'
import { isBlockedEitherWay } from './blocksRepo.js'

export const promptRouter = Router()

const CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug'] as const
type Category = (typeof CATEGORIES)[number]

function validatePromptBody(body: unknown): { category: Category; text: string } | { error: string } {
  const b = (body ?? {}) as { category?: unknown; text?: unknown }
  const category = typeof b.category === 'string' ? b.category : ''
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (!CATEGORIES.includes(category as Category)) {
    return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` }
  }
  if (!text) return { error: 'Prompt text is required.' }
  return { category: category as Category, text }
}

function autoCaptionFor(senderName: string, promptText: string): string {
  return `${senderName} prompted: "${promptText}"`
}

const insertPrompt = db.prepare(`
  INSERT INTO prompts (id, sender_account_id, recipient_account_id, is_broadcast, category, prompt_text, status, created_at)
  VALUES (@id, @senderAccountId, @recipientAccountId, @isBroadcast, @category, @text, @status, @createdAt)
`)

// --- Send a 1:1 prompt -------------------------------------------------

promptRouter.post('/api/prompts', requireAuth, (req, res) => {
  const sender = req.account!

  const sendCheck = canSendOneToOne(sender)
  if (!sendCheck.ok) return res.status(403).json({ errors: { form: sendCheck.reason } })

  const recipientUsername = String(req.body?.recipientUsername ?? '')
  const recipient = getAccountByUsername(recipientUsername)
  if (!recipient) return res.status(404).json({ errors: { recipientUsername: 'No account with that username.' } })
  if (recipient.id === sender.id) return res.status(422).json({ errors: { recipientUsername: 'You cannot prompt yourself.' } })
  if (isBlockedEitherWay(sender.id, recipient.id)) {
    return res.status(403).json({ errors: { recipientUsername: 'You cannot send a prompt to this account.' } })
  }

  const relationship = {
    senderFollowsRecipient: isFollowing(sender.id, recipient.id),
    recipientFollowsSender: isFollowing(recipient.id, sender.id),
  }
  const receiveCheck = canReceiveOneToOne(
    { accountType: recipient.account_type, promptPermission: recipient.prompt_permission },
    relationship,
  )
  if (!receiveCheck.ok) return res.status(403).json({ errors: { recipientUsername: receiveCheck.reason } })

  const parsed = validatePromptBody(req.body)
  if ('error' in parsed) return res.status(422).json({ errors: { text: parsed.error } })

  const id = crypto.randomUUID()
  insertPrompt.run({
    id,
    senderAccountId: sender.id,
    recipientAccountId: recipient.id,
    isBroadcast: 0,
    category: parsed.category,
    text: parsed.text,
    status: 'pending',
    createdAt: Date.now(),
  })

  notifyAccount(recipient.id, `${sender.displayName} sent you a prompt`, parsed.text)

  res.status(201).json({
    id,
    category: parsed.category,
    text: parsed.text,
    status: 'pending',
    senderUsername: sender.username,
    recipientUsername: recipient.username,
  })
})

// --- Broadcast (organization only) -------------------------------------

promptRouter.post('/api/prompts/broadcast', requireAuth, (req, res) => {
  const sender = req.account!
  const check = canBroadcast(sender)
  if (!check.ok) return res.status(403).json({ errors: { form: check.reason } })

  const parsed = validatePromptBody(req.body)
  if ('error' in parsed) return res.status(422).json({ errors: { text: parsed.error } })

  const id = crypto.randomUUID()
  insertPrompt.run({
    id,
    senderAccountId: sender.id,
    recipientAccountId: null,
    isBroadcast: 1,
    category: parsed.category,
    text: parsed.text,
    status: 'active',
    createdAt: Date.now(),
  })

  res.status(201).json({ id, category: parsed.category, text: parsed.text, status: 'active', senderUsername: sender.username })
})

// --- Active broadcasts available to me (organization or board) -----------
// Backs the fridge-note strip on Home alongside 1:1 prompts: any broadcast
// from someone I follow, or from a board I subscribe to, that I haven't
// completed yet.

const pendingOneToOne = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.created_at AS createdAt, p.status,
         a.username AS senderUsername, a.first_name, a.organization_name
  FROM prompts p
  JOIN accounts a ON a.id = p.sender_account_id
  WHERE p.is_broadcast = 0 AND p.recipient_account_id = ? AND p.status = 'pending'
  ORDER BY p.created_at DESC
`)

const activeOrgBroadcastsFromFollowed = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.created_at AS createdAt, p.board_id AS boardId,
         a.username AS senderUsername, a.first_name, a.organization_name
  FROM prompts p
  JOIN accounts a ON a.id = p.sender_account_id
  JOIN follows f ON f.followee_account_id = p.sender_account_id AND f.follower_account_id = ?
  WHERE p.is_broadcast = 1 AND p.board_id IS NULL AND p.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM prompt_completions c WHERE c.prompt_id = p.id AND c.completer_account_id = ?)
  ORDER BY p.created_at DESC
`)

const activeBoardBroadcastsFromSubscribed = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.created_at AS createdAt, p.board_id AS boardId,
         a.username AS senderUsername, a.first_name, a.organization_name, b.name AS boardName
  FROM prompts p
  JOIN accounts a ON a.id = p.sender_account_id
  JOIN boards b ON b.id = p.board_id
  JOIN board_subscribers s ON s.board_id = p.board_id AND s.account_id = ?
  WHERE p.is_broadcast = 1 AND p.board_id IS NOT NULL AND p.status = 'active'
    AND p.sender_account_id != ?
    AND NOT EXISTS (SELECT 1 FROM prompt_completions c WHERE c.prompt_id = p.id AND c.completer_account_id = ?)
  ORDER BY p.created_at DESC
`)

interface InboxRow {
  id: string
  category: string
  text: string
  createdAt: number
  senderUsername: string
  first_name: string | null
  organization_name: string | null
  boardId?: string | null
  boardName?: string
}

function inboxItem(row: InboxRow, isBroadcast: boolean) {
  return {
    id: row.id,
    isBroadcast,
    category: row.category,
    text: row.text,
    createdAt: row.createdAt,
    senderUsername: row.senderUsername,
    senderDisplayName: row.first_name ?? row.organization_name ?? row.senderUsername,
    boardId: row.boardId ?? undefined,
    boardName: row.boardName,
  }
}

promptRouter.get('/api/prompts/inbox', requireAuth, (req, res) => {
  const me = req.account!
  const oneToOne = (pendingOneToOne.all(me.id) as InboxRow[]).map((row) => inboxItem(row, false))
  const orgBroadcasts = (activeOrgBroadcastsFromFollowed.all(me.id, me.id) as InboxRow[]).map((row) => inboxItem(row, true))
  const boardBroadcasts = (activeBoardBroadcastsFromSubscribed.all(me.id, me.id, me.id) as InboxRow[]).map((row) => inboxItem(row, true))

  res.json([...oneToOne, ...orgBroadcasts, ...boardBroadcasts].sort((a, b) => b.createdAt - a.createdAt))
})

// --- Unsend (1:1 only, sender-only, still pending) ------------------------

const deletePromptStmt = db.prepare('DELETE FROM prompts WHERE id = ?')

promptRouter.delete('/api/prompts/:id', requireAuth, (req, res) => {
  const me = req.account!
  const prompt = getPromptById.get(String(req.params.id)) as Record<string, unknown> | undefined
  if (!prompt) return res.status(404).json({ errors: { form: 'Prompt not found.' } })
  if (prompt.is_broadcast) return res.status(422).json({ errors: { form: 'Broadcasts cannot be unsent.' } })
  if (prompt.sender_account_id !== me.id) return res.status(403).json({ errors: { form: 'You can only unsend a prompt you sent.' } })
  if (prompt.status !== 'pending') return res.status(422).json({ errors: { form: 'This prompt has already been resolved.' } })

  deletePromptStmt.run(prompt.id)
  res.json({ id: prompt.id })
})

// --- Decline (1:1 only) --------------------------------------------------

const getPromptById = db.prepare('SELECT * FROM prompts WHERE id = ?')
const declineStmt = db.prepare(`UPDATE prompts SET status = 'declined' WHERE id = ?`)

promptRouter.post('/api/prompts/:id/decline', requireAuth, (req, res) => {
  const me = req.account!
  const prompt = getPromptById.get(req.params.id) as Record<string, unknown> | undefined
  if (!prompt) return res.status(404).json({ errors: { form: 'Prompt not found.' } })
  if (prompt.is_broadcast) return res.status(422).json({ errors: { form: 'Broadcasts cannot be declined, only skipped.' } })
  if (prompt.recipient_account_id !== me.id) return res.status(403).json({ errors: { form: 'This prompt was not sent to you.' } })
  if (prompt.status !== 'pending') return res.status(422).json({ errors: { form: 'This prompt has already been resolved.' } })

  declineStmt.run(prompt.id)
  res.json({ id: prompt.id, status: 'declined' })
})

// --- Complete (1:1, organization broadcast, or board broadcast) ----------

const completeOneToOneStmt = db.prepare(`
  UPDATE prompts
  SET status = 'completed', completion_media_type = @mediaType, completion_media_data_url = @mediaDataUrl,
      completion_auto_caption = @autoCaption, completion_user_caption = @userCaption, completed_at = @completedAt
  WHERE id = @id
`)

const insertCompletion = db.prepare(`
  INSERT INTO prompt_completions (id, prompt_id, completer_account_id, media_type, media_data_url, auto_caption, user_caption, created_at)
  VALUES (@id, @promptId, @completerAccountId, @mediaType, @mediaDataUrl, @autoCaption, @userCaption, @createdAt)
`)

promptRouter.post('/api/prompts/:id/complete', requireAuth, (req, res) => {
  const me = req.account!
  const prompt = getPromptById.get(String(req.params.id)) as Record<string, unknown> | undefined
  if (!prompt) return res.status(404).json({ errors: { form: 'Prompt not found.' } })

  const rawMediaDataUrl = typeof req.body?.mediaDataUrl === 'string' ? req.body.mediaDataUrl : undefined
  // The lead-in caption is server-generated from the sender + original
  // prompt text and is never accepted from the client — only the
  // completer's own added text is theirs to author.
  const userCaption = typeof req.body?.caption === 'string' ? req.body.caption.trim() || undefined : undefined
  // Every category but "unplug" is proved with a photo/video; unplugging is
  // proved by the timed duration itself (baked into the caption client-side
  // — see UnplugCompleteForm.tsx), so there's nothing to attach here.
  if (!rawMediaDataUrl && prompt.category !== 'unplug') {
    return res.status(422).json({ errors: { media: 'Photo or video proof is required.' } })
  }
  const mediaType = rawMediaDataUrl ? (typeof req.body?.mediaType === 'string' ? req.body.mediaType : 'photo') : undefined
  const mediaDataUrl = rawMediaDataUrl ? saveDataUrlAsFile(rawMediaDataUrl, publicBaseUrl(req)) : undefined

  const sender = getAccountById(prompt.sender_account_id as string)!
  const autoCaption = autoCaptionFor(displayName(sender), prompt.prompt_text as string)

  if (prompt.is_broadcast) {
    const boardId = prompt.board_id as string | null
    const eligible = boardId ? isSubscribed(boardId, me.id) : isFollowing(me.id, prompt.sender_account_id as string)
    const check = canCompleteBroadcast(me, prompt.sender_account_id as string, eligible)
    if (!check.ok) return res.status(403).json({ errors: { form: check.reason } })

    const id = crypto.randomUUID()
    try {
      insertCompletion.run({
        id,
        promptId: prompt.id,
        completerAccountId: me.id,
        mediaType,
        mediaDataUrl,
        autoCaption,
        userCaption,
        createdAt: Date.now(),
      })
    } catch (err) {
      // SQLite's error message names table.column(s), never the index —
      // even for a constraint declared as a named unique index.
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('prompt_completions.prompt_id')) {
        return res.status(409).json({ errors: { form: 'You already completed this challenge.' } })
      }
      throw err
    }

    return res.status(201).json({
      promptId: prompt.id,
      completionId: id,
      senderUsername: sender.username,
      senderDisplayName: displayName(sender),
      completerUsername: me.username,
      completerDisplayName: me.displayName,
      category: prompt.category,
      promptText: prompt.prompt_text,
      autoCaption,
      userCaption,
      mediaType,
      mediaDataUrl,
    })
  }

  if (prompt.recipient_account_id !== me.id) return res.status(403).json({ errors: { form: 'This prompt was not sent to you.' } })
  if (prompt.status !== 'pending') return res.status(422).json({ errors: { form: 'This prompt has already been resolved.' } })

  completeOneToOneStmt.run({
    id: prompt.id,
    mediaType,
    mediaDataUrl,
    autoCaption,
    userCaption,
    completedAt: Date.now(),
  })

  res.status(200).json({
    promptId: prompt.id,
    senderUsername: sender.username,
    senderDisplayName: displayName(sender),
    completerUsername: me.username,
    completerDisplayName: me.displayName,
    category: prompt.category,
    promptText: prompt.prompt_text,
    autoCaption,
    userCaption,
    mediaType,
    mediaDataUrl,
  })
})

// --- Reactions (upvote/pin) on a completion -------------------------------
// completionId is either a completed prompts.id (1:1) or a
// prompt_completions.id (broadcast) — the reactions table doesn't care which.

promptRouter.post('/api/completions/:id/react', requireAuth, (req, res) => {
  const me = req.account!
  const kind = String(req.body?.kind ?? '')
  if (kind !== 'upvote' && kind !== 'pin') {
    return res.status(422).json({ errors: { kind: 'kind must be "upvote" or "pin".' } })
  }
  toggleReaction(String(req.params.id), me.id, kind)
  res.json(reactionCounts(String(req.params.id), me.id))
})

// --- Organization broadcast gallery ---------------------------------------

const broadcastsForOrg = db.prepare(`
  SELECT id, category, prompt_text AS text, created_at AS createdAt
  FROM prompts WHERE sender_account_id = ? AND is_broadcast = 1 AND board_id IS NULL
  ORDER BY created_at DESC
`)
const completionsForPrompt = db.prepare(`
  SELECT c.id, c.auto_caption AS autoCaption, c.user_caption AS userCaption, c.media_type AS mediaType,
         c.media_data_url AS mediaDataUrl, c.created_at AS createdAt, a.username AS completerUsername
  FROM prompt_completions c
  JOIN accounts a ON a.id = c.completer_account_id
  WHERE c.prompt_id = ?
  ORDER BY c.created_at DESC
`)

promptRouter.get('/api/organizations/:username/broadcasts', (req, res) => {
  const org = getAccountByUsername(req.params.username)
  if (!org || org.account_type !== 'organization') {
    return res.status(404).json({ errors: { form: 'No organization with that username.' } })
  }
  const broadcasts = (broadcastsForOrg.all(org.id) as Record<string, unknown>[]).map((b) => {
    const completions = completionsForPrompt.all(b.id)
    return { ...b, participationCount: completions.length, completions }
  })
  res.json(broadcasts)
})

// --- My history (both sides of the interaction) ---------------------------

const oneToOneHistory = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS promptText, p.status, p.completion_auto_caption AS autoCaption,
         p.completion_user_caption AS userCaption, p.completion_media_type AS mediaType,
         p.completion_media_data_url AS mediaDataUrl, p.created_at AS createdAt, p.completed_at AS completedAt,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         recipient.username AS recipientUsername
  FROM prompts p
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts recipient ON recipient.id = p.recipient_account_id
  WHERE p.is_broadcast = 0 AND (p.sender_account_id = ? OR p.recipient_account_id = ?)
  ORDER BY p.created_at DESC
`)

const broadcastHistory = db.prepare(`
  SELECT c.id, p.category, p.prompt_text AS promptText, c.auto_caption AS autoCaption, c.user_caption AS userCaption,
         c.media_type AS mediaType, c.media_data_url AS mediaDataUrl, c.created_at AS completedAt,
         sender.username AS senderUsername, completer.username AS completerUsername
  FROM prompt_completions c
  JOIN prompts p ON p.id = c.prompt_id
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts completer ON completer.id = c.completer_account_id
  WHERE p.sender_account_id = ? OR c.completer_account_id = ?
  ORDER BY c.created_at DESC
`)

interface OneToOneHistoryRow {
  id: string
  category: string
  promptText: string
  status: string
  autoCaption: string | null
  userCaption: string | null
  mediaType: string | null
  mediaDataUrl: string | null
  createdAt: number
  completedAt: number | null
  senderUsername: string
  senderFirstName: string | null
  senderOrgName: string | null
  recipientUsername: string
}

promptRouter.get('/api/prompts/history', requireAuth, (req, res) => {
  const me = req.account!
  const oneToOne = (oneToOneHistory.all(me.id, me.id) as OneToOneHistoryRow[]).map((row) => ({
    id: row.id,
    category: row.category,
    promptText: row.promptText,
    status: row.status,
    autoCaption: row.autoCaption ?? undefined,
    userCaption: row.userCaption ?? undefined,
    mediaType: row.mediaType ?? undefined,
    mediaDataUrl: row.mediaDataUrl ?? undefined,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined,
    senderUsername: row.senderUsername,
    senderDisplayName: row.senderFirstName ?? row.senderOrgName ?? row.senderUsername,
    recipientUsername: row.recipientUsername,
  }))
  const broadcasts = broadcastHistory.all(me.id, me.id)
  res.json({ oneToOne, broadcasts })
})
