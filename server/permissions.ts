// Single source of truth for the account-type permission matrix (concept
// brief Section 8.5). Every route that sends, receives, broadcasts, or
// follows calls into these functions rather than re-deriving the rules
// inline — a new account type or a changed rule is a change made once,
// here, not a hunt through scattered conditionals (Section 12).
//
//   Account type | Send 1:1 | Receive 1:1          | Broadcast
//   individual   | yes      | yes (permission tier) | no
//   organization | no       | no                    | yes
//   verified     | yes      | yes (allowlist-only)  | yes
//
// Verified/influencer accounts and the allowlist are explicitly out of
// v1 scope (see the MVP doc, Section 11) — there is no `verified` branch
// below yet. When that ships, it plugs into canBroadcast and
// canReceiveOneToOne alongside the existing branches; nothing that calls
// these functions needs to change.

export type AccountType = 'individual' | 'organization'
export type PromptPermission = 'everyone' | 'followers' | 'mutuals'

export type PermissionResult = { ok: true } | { ok: false; reason: string }

const ALLOW: PermissionResult = { ok: true }
function deny(reason: string): PermissionResult {
  return { ok: false, reason }
}

export function canFollow(actor: { accountType: AccountType }): PermissionResult {
  if (actor.accountType === 'organization') {
    return deny('Organization accounts cannot follow other accounts.')
  }
  return ALLOW
}

export function canSendOneToOne(sender: { accountType: AccountType }): PermissionResult {
  if (sender.accountType === 'organization') {
    return deny('Organization accounts can only broadcast to followers, not send a prompt to one person.')
  }
  return ALLOW
}

export function canBroadcast(sender: { accountType: AccountType }): PermissionResult {
  if (sender.accountType === 'organization') return ALLOW
  return deny('Only organization accounts can broadcast prompts.')
}

export function canReceiveOneToOne(
  recipient: { accountType: AccountType; promptPermission: PromptPermission },
  relationship: { senderFollowsRecipient: boolean; recipientFollowsSender: boolean },
): PermissionResult {
  if (recipient.accountType === 'organization') {
    return deny('Organization accounts cannot receive prompts.')
  }
  switch (recipient.promptPermission) {
    case 'everyone':
      return ALLOW
    case 'followers':
      return relationship.senderFollowsRecipient
        ? ALLOW
        : deny('This account only accepts prompts from people who follow them.')
    case 'mutuals':
      return relationship.senderFollowsRecipient && relationship.recipientFollowsSender
        ? ALLOW
        : deny('This account only accepts prompts from mutual follows.')
  }
}

// A follower may complete a given org's broadcast — subscribing (following)
// is the opt-in, per Section 2.2/3.5. Anyone else, including the org's own
// account, cannot. A board broadcast reuses this same check but with
// `allowSelf: true`: the sender_account_id on a board broadcast is the
// board's owner, who is also always a normal subscriber of their own board
// (unlike an organization, which has no separate "individual" identity to
// complete as) — so the owner completing their own board's challenge is
// expected, not a self-broadcast loophole.
export function canCompleteBroadcast(
  completer: { accountType: AccountType; id: string },
  broadcastSenderId: string,
  isEligible: boolean,
  opts: { allowSelf?: boolean } = {},
): PermissionResult {
  if (completer.accountType === 'organization') {
    return deny('Organization accounts cannot complete prompts.')
  }
  if (!opts.allowSelf && completer.id === broadcastSenderId) {
    return deny('You cannot complete your own broadcast.')
  }
  return isEligible ? ALLOW : deny('You need access to this broadcast to complete it.')
}
