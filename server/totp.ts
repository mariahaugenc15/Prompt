import crypto from 'node:crypto'
import { hashPassword, verifyPassword } from './passwordHash.js'

// TOTP (RFC 6238, built on the HOTP counter algorithm of RFC 4226) — works
// with any standard authenticator app (Google Authenticator, Authy, 1Password,
// etc.) with no third-party service or paid SMS provider involved, unlike
// SMS-based 2FA, which this app has no infrastructure for anyway (only
// email, via server/emailer.ts).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(key: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8)
  // Counter fits comfortably in 32 bits until the year 6429 (2^32 * 30s
  // steps), so the high 4 bytes are always zero — still written explicitly
  // per RFC 4226's 8-byte counter.
  counterBuf.writeUInt32BE(0, 0)
  counterBuf.writeUInt32BE(counter >>> 0, 4)
  const digest = crypto.createHmac('sha1', key).update(counterBuf).digest()
  const offset = digest[digest.length - 1] & 0xf
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

// Groups of 4 for the "type this into your app" manual-entry display —
// there's no QR code here (no image-generation dependency in this project),
// so the raw secret is what people actually enter.
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

export function otpauthUrl(secret: string, accountLabel: string): string {
  return `otpauth://totp/Prompt:${encodeURIComponent(accountLabel)}?secret=${secret}&issuer=Prompt&digits=${DIGITS}&period=${STEP_SECONDS}`
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

// Checked against the current time step and one step on either side, to
// tolerate ordinary clock drift between the server and the phone running
// the authenticator app without meaningfully widening the guessing window.
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const clean = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const key = base32Decode(secret)
  const nowCounter = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  for (let delta = -window; delta <= window; delta++) {
    if (timingSafeEqualStr(hotp(key, nowCounter + delta), clean)) return true
  }
  return false
}

export interface HashedBackupCode {
  hash: string
  salt: string
}

function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Recovery codes for when the authenticator app itself is unreachable (lost
// or wiped phone) — without these, losing the device would mean permanently
// losing access to a 2FA-protected account with no way back in.
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase()
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`)
  }
  return codes
}

export function hashBackupCodes(codes: string[]): HashedBackupCode[] {
  return codes.map((c) => hashPassword(normalizeBackupCode(c)))
}

// Returns the index of the matching (and now consumed) code, or -1 — the
// caller is expected to remove that entry so each backup code works once.
export function matchBackupCode(input: string, hashed: HashedBackupCode[]): number {
  const normalized = normalizeBackupCode(input)
  if (!normalized) return -1
  return hashed.findIndex((h) => verifyPassword(normalized, h.salt, h.hash))
}
