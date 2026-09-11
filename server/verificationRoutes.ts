import { Router } from 'express'
import crypto from 'node:crypto'
import { requireAuth } from './auth.js'
import { followerCount } from './accountsRepo.js'
import {
  createVerificationRequest,
  getLatestVerificationRequest,
  hasPendingVerificationRequest,
  type VerificationCategory,
} from './verificationRepo.js'

export const verificationRouter = Router()

const CATEGORIES: VerificationCategory[] = ['organization', 'public_figure', 'other']
const MAX_LINKS_LENGTH = 1000
const MAX_EXPLANATION_LENGTH = 2000

// A real follower base is what "high-profile" actually means here — without
// a minimum, anyone could apply the moment they sign up. Must have MORE
// THAN this many followers (strictly greater, so exactly 1,000 doesn't
// qualify) — a deliberately round floor, not derived from anything; revisit
// if it turns out to be way off for how this app's audience actually grows.
export const MIN_FOLLOWERS_FOR_VERIFICATION = 1000

// POST /api/verification/request — organizations and high-profile individual
// accounts (athletes, creators, etc. — there's no separate account type for
// "high-profile"; an admin judges that from what's submitted here) ask to be
// marked verified. Requires 2FA already enabled: a verified badge is a
// bigger prize for an account-takeover attempt than an ordinary account, so
// the account needs to already be hardened before it's allowed to carry one.
// Also requires a real follower base — see MIN_FOLLOWERS_FOR_VERIFICATION.
verificationRouter.post('/api/verification/request', requireAuth, (req, res) => {
  const me = req.account!
  if (!me.totpEnabled) {
    return res.status(422).json({
      errors: { form: 'Turn on two-factor authentication in Security settings before requesting verification.' },
    })
  }
  if (followerCount(me.id) <= MIN_FOLLOWERS_FOR_VERIFICATION) {
    return res.status(422).json({
      errors: { form: `You need more than ${MIN_FOLLOWERS_FOR_VERIFICATION.toLocaleString()} followers to request verification.` },
    })
  }
  if (me.isVerified) {
    return res.status(422).json({ errors: { form: 'This account is already verified.' } })
  }
  if (hasPendingVerificationRequest(me.id)) {
    return res.status(422).json({ errors: { form: 'You already have a verification request pending review.' } })
  }

  const category = String(req.body?.category ?? '') as VerificationCategory
  const links = typeof req.body?.links === 'string' ? req.body.links.trim() : ''
  const explanation = typeof req.body?.explanation === 'string' ? req.body.explanation.trim() : ''

  if (!CATEGORIES.includes(category)) {
    return res.status(422).json({ errors: { category: `Must be one of: ${CATEGORIES.join(', ')}.` } })
  }
  if (!links) return res.status(422).json({ errors: { links: 'Add at least one link that helps confirm who you are (official site, verified social profile, press coverage, etc.).' } })
  if (links.length > MAX_LINKS_LENGTH) return res.status(422).json({ errors: { links: `Keep this under ${MAX_LINKS_LENGTH} characters.` } })
  if (!explanation) return res.status(422).json({ errors: { explanation: 'Tell us why this account should be verified.' } })
  if (explanation.length > MAX_EXPLANATION_LENGTH) {
    return res.status(422).json({ errors: { explanation: `Keep this under ${MAX_EXPLANATION_LENGTH} characters.` } })
  }

  createVerificationRequest({
    id: crypto.randomUUID(),
    accountId: me.id,
    category,
    links,
    explanation,
    createdAt: Date.now(),
  })
  res.status(201).json({ ok: true })
})

// GET /api/verification/status — lets the account's own Profile settings
// show "pending", "rejected: <note>", or nothing, without needing admin
// access to look at the verification_requests table directly. Also reports
// the follower-count gate so the UI can show real progress toward it rather
// than only surfacing the requirement after a failed submit.
verificationRouter.get('/api/verification/status', requireAuth, (req, res) => {
  const me = req.account!
  const latest = getLatestVerificationRequest(me.id)
  res.json({
    isVerified: me.isVerified,
    followerCount: followerCount(me.id),
    minFollowersRequired: MIN_FOLLOWERS_FOR_VERIFICATION,
    latestRequest: latest
      ? {
          status: latest.status,
          category: latest.category,
          reviewNote: latest.review_note ?? undefined,
          createdAt: latest.created_at,
        }
      : null,
  })
})
