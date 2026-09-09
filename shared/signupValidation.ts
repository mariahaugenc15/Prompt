// Shared between the client (real-time + submit-time form validation) and
// the server (source-of-truth validation) so the two never drift apart.
// Format-only: uniqueness (username/email) requires a database lookup, so
// callers layer that in separately — see server/index.ts.

export type AccountType = 'individual' | 'organization'

interface BaseSignupInput {
  username: string
  email: string
  password: string
}

export interface IndividualSignupInput extends BaseSignupInput {
  accountType: 'individual'
  firstName: string
}

export interface OrganizationSignupInput extends BaseSignupInput {
  accountType: 'organization'
  organizationName: string
  websiteUrl: string
}

export type SignupInput = IndividualSignupInput | OrganizationSignupInput

export type FieldErrors = Record<string, string>

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isBlank(value: string): boolean {
  return value.trim().length === 0
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateUsernameFormat(username: string): string | undefined {
  if (isBlank(username)) return 'Username is required.'
  const trimmed = username.trim()
  if (trimmed.length < 3 || trimmed.length > 24) {
    return 'Username must be 3–24 characters.'
  }
  if (!USERNAME_RE.test(trimmed)) {
    return 'Username can only contain letters, numbers, underscores, and periods.'
  }
  return undefined
}

export function validateEmailFormat(email: string): string | undefined {
  if (isBlank(email)) return 'Email is required.'
  if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.'
  return undefined
}

// Baseline strength requirement — not specified in the brief, so this is a
// reasonable default rather than a firm spec: at least 8 characters with a
// letter and a number.
export function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.'
  }
  return undefined
}

// Format-validates only. Whether to also verify the site is live is a
// separate decision — see the "reachability" note in server/index.ts.
export function validateWebsiteUrlFormat(url: string): string | undefined {
  if (isBlank(url)) return 'Website URL is required.'
  const trimmed = url.trim()
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return 'Please enter a valid website URL.'
  }
  if (!parsed.hostname.includes('.') || parsed.hostname.split('.').some((part) => part.length === 0)) {
    return 'Please enter a valid website URL.'
  }
  return undefined
}

/**
 * Format/required-field validation for both account types. Account type is
 * a single branch point here — add a field to one branch and it can never
 * silently diverge into a second, out-of-sync copy of the individual path.
 */
export function validateSignupFields(input: SignupInput): FieldErrors {
  const errors: FieldErrors = {}

  const usernameError = validateUsernameFormat(input.username)
  if (usernameError) errors.username = usernameError

  const emailError = validateEmailFormat(input.email)
  if (emailError) errors.email = emailError

  const passwordError = validatePassword(input.password)
  if (passwordError) errors.password = passwordError

  if (input.accountType === 'individual') {
    if (isBlank(input.firstName)) errors.firstName = 'First name is required.'
  } else {
    if (isBlank(input.organizationName)) errors.organizationName = 'Organization name is required.'
    const urlError = validateWebsiteUrlFormat(input.websiteUrl)
    if (urlError) errors.websiteUrl = urlError
  }

  return errors
}
