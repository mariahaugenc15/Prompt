import { Router } from 'express'
import crypto from 'node:crypto'
import { parseBuffer } from 'music-metadata'
import { db } from './db.js'
import { requireAuth } from './auth.js'
import { canBroadcast, canCompleteBroadcast, canReceiveOneToOne, canSendOneToOne } from './permissions.js'
import { displayName, getAccountById, getAccountByUsername, isFollowing } from './accountsRepo.js'
import { isSubscribed } from './boardsRepo.js'
import { reactionCounts, toggleReaction } from './reactionsRepo.js'
import { notifyForEvent } from './notificationsRepo.js'
import { publicBaseUrl, saveDataUrlAsFile } from './mediaStore.js'
import { isBlockedEitherWay } from './blocksRepo.js'
import { canViewCompletion, rowIsSealedHidden } from './completionsRepo.js'
import { awardStamp } from './stampsRepo.js'
import { sanitizeNoteStyle } from './noteStyle.js'
import { getGroupById, maybeRevealIfGroupComplete } from './groupPromptsRepo.js'

export const promptRouter = Router()

const CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug'] as const
type Category = (typeof CATEGORIES)[number]

// "Sound it" voice-note proof — matches src/lib/media.ts's client-side cap.
// A client-side-only limit isn't a real limit, so this is checked again
// here regardless of what the client already enforced.
const MAX_AUDIO_BYTES = 6 * 1024 * 1024
// Matches src/lib/media.ts's MAX_AUDIO_DURATION_SECONDS (the client
// auto-stops recording at this point). The byte cap above is a generous
// proxy for this at typical voice-recording bitrates, but a crafted
// low-bitrate upload could stay under it while running far longer, so
// this actually measures the decoded duration rather than inferring it.
const MAX_AUDIO_DURATION_SECONDS = 120
const DATA_URL_RE = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s

function decodedDataUrlByteLength(dataUrl: string): number {
  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) return 0
  const base64 = match[2]
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

// Decodes and actually probes the audio container/codec for its real
// duration rather than trusting anything the client claims. Returns
// undefined if the data URL can't be parsed or the format can't be read,
// which callers treat as a rejection (fail closed) — standard formats
// from MediaRecorder (webm/opus, mp4/aac) and typical picked files
// (m4a, mp3, wav) all parse fine, so this only ever rejects something
// genuinely unreadable or deliberately malformed.
async function audioDurationSeconds(dataUrl: string): Promise<number | undefined> {
  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) return undefined
  const [, mimeType, base64] = match
  try {
    const metadata = await parseBuffer(Buffer.from(base64, 'base64'), mimeType)
    return metadata.format.duration
  } catch {
    return undefined
  }
}

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
  INSERT INTO prompts (id, sender_account_id, recipient_account_id, is_broadcast, category, prompt_text, status, note_color, note_sticker, note_handwriting, created_at)
  VALUES (@id, @senderAccountId, @recipientAccountId, @isBroadcast, @category, @text, @status, @noteColor, @noteSticker, @noteHandwriting, @createdAt)
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
  const noteStyle = sanitizeNoteStyle(req.body)

  const id = crypto.randomUUID()
  insertPrompt.run({
    id,
    senderAccountId: sender.id,
    recipientAccountId: recipient.id,
    isBroadcast: 0,
    category: parsed.category,
    text: parsed.text,
    status: 'pending',
    ...noteStyle,
    createdAt: Date.now(),
  })

  notifyForEvent(recipient.id, 'new_prompt', `${sender.displayName} sent you a prompt`, parsed.text)

  res.status(201).json({
    id,
    category: parsed.category,
    text: parsed.text,
    status: 'pending',
    senderUsername: sender.username,
    recipientUsername: recipient.username,
    ...noteStyle,
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
    noteColor: null,
    noteSticker: null,
    noteHandwriting: null,
    createdAt: Date.now(),
  })

  res.status(201).json({ id, category: parsed.category, text: parsed.text, status: 'active', senderUsername: sender.username })
})

// --- Active broadcasts available to me (organization or board) -----------
// Backs the fridge-note strip on Home alongside 1:1 prompts: any broadcast
// from someone I follow, or from a board I subscribe to, that I haven't
// completed yet.

// group_id IS NULL excludes a group/sealed prompt from the ordinary
// corkboard inbox entirely (Phase 12 added after this query already
// existed) — it has its own dedicated flow (GET /api/prompt-groups/received,
// src/pages/GroupPrompts.tsx) with the sealed-card/waiting-on-others
// messaging this plain note UI has no way to show. Without this filter a
// pending group member's row would render here as an ordinary note with
// no indication other people are involved at all, and then show up a
// second time, looking unrelated, in the group prompts list.
const pendingOneToOne = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.created_at AS createdAt, p.status,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
         a.username AS senderUsername, a.first_name, a.organization_name
  FROM prompts p
  JOIN accounts a ON a.id = p.sender_account_id
  WHERE p.is_broadcast = 0 AND p.recipient_account_id = ? AND p.status = 'pending' AND p.group_id IS NULL
  ORDER BY p.created_at DESC
`)

const activeOrgBroadcastsFromFollowed = db.prepare(`
  SELECT p.id, p.category, p.prompt_text AS text, p.created_at AS createdAt, p.board_id AS boardId,
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
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
         p.note_color AS noteColor, p.note_sticker AS noteSticker, p.note_handwriting AS noteHandwriting,
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
  noteColor: string | null
  noteSticker: string | null
  noteHandwriting: string | null
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
    noteColor: row.noteColor ?? undefined,
    noteSticker: row.noteSticker ?? undefined,
    noteHandwriting: row.noteHandwriting ?? undefined,
    senderUsername: row.senderUsername,
    senderDisplayName: row.first_name ?? row.organization_name ?? row.senderUsername,
    boardId: row.boardId ?? undefined,
    boardName: row.boardName,
  }
}

// Exported so other consumers of "what's waiting for this account to
// respond to" (the widget snapshot endpoint) can reuse the exact same
// query instead of re-deriving it.
export function getInboxItems(accountId: string) {
  const oneToOne = (pendingOneToOne.all(accountId) as InboxRow[]).map((row) => inboxItem(row, false))
  const orgBroadcasts = (activeOrgBroadcastsFromFollowed.all(accountId, accountId) as InboxRow[]).map((row) => inboxItem(row, true))
  const boardBroadcasts = (activeBoardBroadcastsFromSubscribed.all(accountId, accountId, accountId) as InboxRow[]).map((row) =>
    inboxItem(row, true),
  )
  return [...oneToOne, ...orgBroadcasts, ...boardBroadcasts].sort((a, b) => b.createdAt - a.createdAt)
}

promptRouter.get('/api/prompts/inbox', requireAuth, (req, res) => {
  res.json(getInboxItems(req.account!.id))
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

promptRouter.post('/api/prompts/:id/complete', requireAuth, async (req, res) => {
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
  if (mediaType === 'audio' && rawMediaDataUrl) {
    if (decodedDataUrlByteLength(rawMediaDataUrl) > MAX_AUDIO_BYTES) {
      return res.status(422).json({
        errors: { media: `That recording is too large (max ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))}MB). Try a shorter one.` },
      })
    }
    const duration = await audioDurationSeconds(rawMediaDataUrl)
    if (duration === undefined || duration > MAX_AUDIO_DURATION_SECONDS) {
      return res.status(422).json({
        errors: { media: `That recording is too long (max ${MAX_AUDIO_DURATION_SECONDS} seconds). Try a shorter one.` },
      })
    }
  }
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

    if (sender.id !== me.id) {
      notifyForEvent(sender.id, 'prompt_completed', `${me.displayName} completed your prompt`, prompt.prompt_text as string)
    }
    awardStamp(me.id, id, prompt.category as string)

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

  const groupId = prompt.group_id as string | null
  if (groupId) {
    const group = getGroupById(groupId)
    // 12.5: a cancelled group's still-pending members can no longer
    // complete it — cancellation never touches prompts.status (see
    // db.ts's prompt_groups comment), so this explicit check is the only
    // thing stopping it.
    if (group?.cancelled_at) return res.status(422).json({ errors: { form: 'This prompt was cancelled.' } })
  }

  completeOneToOneStmt.run({
    id: prompt.id,
    mediaType,
    mediaDataUrl,
    autoCaption,
    userCaption,
    completedAt: Date.now(),
  })

  // 12.3/12.4: a sealed, unrevealed group never tells its sender anything
  // beyond the progress count they can already see on their sent list —
  // not even "someone completed it" — so the standard per-completion
  // notification is skipped entirely here. If this completion is the
  // group's last one, maybeRevealIfGroupComplete reveals it immediately
  // and sends the real "sealed prompt is open" notification instead,
  // which is the only notification a sealed group ever produces before
  // its deadline passes. An unsealed group prompt (or a plain 1:1,
  // groupId null) behaves exactly as before.
  const group = groupId ? getGroupById(groupId) : undefined
  if (!group?.sealed) {
    notifyForEvent(sender.id, 'prompt_completed', `${me.displayName} completed your prompt`, prompt.prompt_text as string)
  }
  if (groupId) maybeRevealIfGroupComplete(groupId)
  awardStamp(me.id, prompt.id as string, prompt.category as string)

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

// --- Reactions (like/dislike/laugh, plus the independent pin) on a
// completion ----------------------------------------------------------------
// completionId is either a completed prompts.id (1:1) or a
// prompt_completions.id (broadcast) — the reactions table doesn't care which.

const REACT_KINDS = ['like', 'dislike', 'laugh', 'pin'] as const

promptRouter.post('/api/completions/:id/react', requireAuth, (req, res) => {
  const me = req.account!
  const kind = String(req.body?.kind ?? '')
  if (!REACT_KINDS.includes(kind as (typeof REACT_KINDS)[number])) {
    return res.status(422).json({ errors: { kind: `kind must be one of: ${REACT_KINDS.join(', ')}.` } })
  }
  const completionId = String(req.params.id)
  if (!canViewCompletion(completionId, me.id)) {
    return res.status(404).json({ errors: { form: 'Not found.' } })
  }
  toggleReaction(completionId, me.id, kind as (typeof REACT_KINDS)[number])
  res.json(reactionCounts(completionId, me.id))
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
         p.completion_media_data_url AS mediaDataUrl, p.note_color AS noteColor, p.note_sticker AS noteSticker,
         p.note_handwriting AS noteHandwriting, p.created_at AS createdAt, p.completed_at AS completedAt,
         p.group_id AS groupId, p.recipient_account_id AS recipientAccountId,
         sender.username AS senderUsername, sender.first_name AS senderFirstName, sender.organization_name AS senderOrgName,
         recipient.username AS recipientUsername
  FROM prompts p
  JOIN accounts sender ON sender.id = p.sender_account_id
  JOIN accounts recipient ON recipient.id = p.recipient_account_id
  -- group_id IS NULL: a group/sealed prompt is excluded from this legacy
  -- "my 1:1 notes" endpoint entirely, not just content-stripped. It has
  -- its own dedicated surface (GET /api/prompt-groups/*,
  -- src/pages/GroupPrompts.tsx) with the sealed-card/waiting-on-others
  -- messaging this plain note UI can't show; without this exclusion it
  -- rendered twice, once here as a note with no indication other people
  -- were involved, and once there with full context.
  WHERE p.is_broadcast = 0 AND p.group_id IS NULL AND (p.sender_account_id = ? OR p.recipient_account_id = ?)
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
  noteColor: string | null
  noteSticker: string | null
  noteHandwriting: string | null
  createdAt: number
  completedAt: number | null
  groupId: string | null
  recipientAccountId: string | null
  senderUsername: string
  senderFirstName: string | null
  senderOrgName: string | null
  recipientUsername: string
}

promptRouter.get('/api/prompts/history', requireAuth, (req, res) => {
  const me = req.account!
  const oneToOne = (oneToOneHistory.all(me.id, me.id) as OneToOneHistoryRow[]).map((row) => {
    // Belt and suspenders: the query above already excludes every
    // group_id row outright, so `hidden` should never actually be true
    // here. Kept anyway, exactly because this endpoint is the one that
    // shipped the real leak during development (a second, unsynchronized
    // copy of "is this sealed" logic that nobody thought to apply here) —
    // if a future change ever loosens that WHERE clause, this is a second
    // independent gate standing between a sealed response and the
    // sender's own history view, not just a comment hoping it stays right.
    const hidden = rowIsSealedHidden(row.groupId, row.recipientAccountId, me.id)
    return {
      id: row.id,
      category: row.category,
      promptText: row.promptText,
      status: row.status,
      autoCaption: hidden ? undefined : (row.autoCaption ?? undefined),
      userCaption: hidden ? undefined : (row.userCaption ?? undefined),
      mediaType: hidden ? undefined : (row.mediaType ?? undefined),
      mediaDataUrl: hidden ? undefined : (row.mediaDataUrl ?? undefined),
      noteColor: row.noteColor ?? undefined,
      noteSticker: row.noteSticker ?? undefined,
      noteHandwriting: row.noteHandwriting ?? undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? undefined,
      senderUsername: row.senderUsername,
      senderDisplayName: row.senderFirstName ?? row.senderOrgName ?? row.senderUsername,
      recipientUsername: row.recipientUsername,
    }
  })
  const broadcasts = broadcastHistory.all(me.id, me.id)
  res.json({ oneToOne, broadcasts })
})
