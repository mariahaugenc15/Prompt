import { Router } from 'express'
import { requireAuth } from './auth.js'
import { canSendOneToOne, canReceiveOneToOne } from './permissions.js'
import { getAccountByUsername, isFollowing } from './accountsRepo.js'
import { isBlockedEitherWay } from './blocksRepo.js'
import { isDeadlineHours, createGroupPrompt, sentGroupPrompts, receivedGroupPrompts, groupDetail, cancelGroupPrompt } from './groupPromptsRepo.js'
import { notifyForEvent } from './notificationsRepo.js'

export const groupPromptsRouter = Router()

const CATEGORIES = ['snap', 'sound', 'show', 'share', 'unplug'] as const
const MIN_RECIPIENTS = 2
const MAX_RECIPIENTS = 10

// POST /api/prompts/group — 12.1's "extend Send a prompt so a sender can
// address 2 to 10 recipients in a single prompt." All-or-nothing: every
// recipient must individually pass the exact same checks a 1:1 send would
// (self-send, blocks, receive permission), or nothing is created — no
// partial group where some recipients silently never got it.
groupPromptsRouter.post('/api/prompts/group', requireAuth, (req, res) => {
  const sender = req.account!
  const sendCheck = canSendOneToOne(sender)
  if (!sendCheck.ok) return res.status(403).json({ errors: { form: sendCheck.reason } })

  const rawUsernames = Array.isArray(req.body?.recipientUsernames) ? (req.body.recipientUsernames as unknown[]) : []
  const usernames = rawUsernames.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
  const uniqueUsernames = Array.from(new Set(usernames.map((u) => u.toLowerCase())))
  if (uniqueUsernames.length !== usernames.length) {
    return res.status(422).json({ errors: { recipientUsernames: 'Recipients must be unique.' } })
  }
  if (usernames.length < MIN_RECIPIENTS || usernames.length > MAX_RECIPIENTS) {
    return res.status(422).json({ errors: { recipientUsernames: `A group prompt needs between ${MIN_RECIPIENTS} and ${MAX_RECIPIENTS} recipients.` } })
  }

  const category = typeof req.body?.category === 'string' ? req.body.category : ''
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return res.status(422).json({ errors: { category: `Category must be one of: ${CATEGORIES.join(', ')}.` } })
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(422).json({ errors: { text: 'Prompt text is required.' } })

  const sealed = req.body?.sealed === true
  const deadlineHoursInput = sealed ? req.body?.deadlineHours : 48
  if (sealed && !isDeadlineHours(deadlineHoursInput)) {
    return res.status(422).json({ errors: { deadlineHours: 'Deadline must be 24, 48, or 168 hours.' } })
  }
  const deadlineHours = isDeadlineHours(deadlineHoursInput) ? deadlineHoursInput : 48

  const recipientIds: string[] = []
  for (const username of usernames) {
    const recipient = getAccountByUsername(username)
    if (!recipient) return res.status(404).json({ errors: { recipientUsernames: `No account called @${username}.` } })
    if (recipient.id === sender.id) return res.status(422).json({ errors: { recipientUsernames: 'You cannot prompt yourself.' } })
    if (isBlockedEitherWay(sender.id, recipient.id)) {
      return res.status(403).json({ errors: { recipientUsernames: `You cannot send a prompt to @${username}.` } })
    }
    const relationship = {
      senderFollowsRecipient: isFollowing(sender.id, recipient.id),
      recipientFollowsSender: isFollowing(recipient.id, sender.id),
    }
    const receiveCheck = canReceiveOneToOne({ accountType: recipient.account_type, promptPermission: recipient.prompt_permission }, relationship)
    if (!receiveCheck.ok) return res.status(403).json({ errors: { recipientUsernames: `@${username}: ${receiveCheck.reason}` } })
    recipientIds.push(recipient.id)
  }

  const { groupId } = createGroupPrompt({
    senderAccountId: sender.id,
    recipientAccountIds: recipientIds,
    category,
    text,
    sealed,
    deadlineHours,
  })

  for (const recipientId of recipientIds) {
    notifyForEvent(recipientId, 'new_prompt', `${sender.displayName} sent you a group prompt`, text)
  }

  res.status(201).json({ id: groupId })
})

groupPromptsRouter.get('/api/prompt-groups/sent', requireAuth, (req, res) => {
  res.json(sentGroupPrompts(req.account!.id))
})

groupPromptsRouter.get('/api/prompt-groups/received', requireAuth, (req, res) => {
  res.json(receivedGroupPrompts(req.account!.id))
})

groupPromptsRouter.get('/api/prompt-groups/:id', requireAuth, (req, res) => {
  const detail = groupDetail(String(req.params.id), req.account!.id)
  if (!detail) return res.status(404).json({ errors: { form: 'No group prompt with that id, or you are not part of it.' } })
  res.json(detail)
})

groupPromptsRouter.post('/api/prompt-groups/:id/cancel', requireAuth, (req, res) => {
  const result = cancelGroupPrompt(String(req.params.id), req.account!.id)
  if (!result.ok) return res.status(422).json({ errors: { form: result.reason } })
  res.json({ ok: true })
})
