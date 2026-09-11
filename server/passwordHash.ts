import crypto from 'node:crypto'

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  // Both sides are always a 64-byte scrypt digest, so the length check
  // above is just for timingSafeEqual's own precondition — it never
  // becomes a length-based side channel on the password itself.
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}
