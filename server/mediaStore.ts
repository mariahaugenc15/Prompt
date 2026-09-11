import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Request } from 'express'

// Proof photos/videos and avatars used to ride as base64 data: URLs stored
// directly in SQLite TEXT columns — simple, but every row drags its full
// media blob along on every query, and the DB balloons fast. This writes
// the decoded bytes to a file on the same persistent disk the DB already
// lives on (see db.ts) and hands back a URL instead. Existing rows that
// still hold an inline data: URL are left alone — they still render fine
// as-is, so there's no need for a one-time migration pass.
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'server', '.data')
export const mediaDir = path.join(dataDir, 'media')
fs.mkdirSync(mediaDir, { recursive: true })

// The frontend and this API are meant to live on different hosts in
// production (see server/index.ts's CORS comment) — a relative "/media/x"
// URL in an API response would resolve against the *frontend's* origin
// when the browser renders it, not this server's. Previously this fell
// back to a hardcoded localhost URL whenever PUBLIC_SERVER_URL wasn't set,
// which silently produced unreachable media URLs in production (nobody's
// browser can resolve "localhost" to this server) — every photo/video/
// avatar looked broken even though the upload itself succeeded. Deriving
// it from the incoming request instead means it always matches wherever
// this server is actually reachable, no manual env var required. Set
// PUBLIC_SERVER_URL only as an override (e.g. a CDN/custom domain in front
// of this server that isn't what req.protocol/host would report).
export function publicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_SERVER_URL) return process.env.PUBLIC_SERVER_URL.replace(/\/$/, '')
  return `${req.protocol}://${req.get('host')}`
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

const DATA_URL_RE = /^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/s

// Decodes a `data:<mime>;base64,<payload>` string, writes it to a file
// under mediaDir, and returns its public URL (built from `baseUrl` — see
// publicBaseUrl above). A value that isn't a data: URL (already a saved
// URL, or missing) passes through unchanged — that covers both a
// defensive re-save and simply having no media at all.
export function saveDataUrlAsFile(dataUrl: string | undefined, baseUrl: string): string | undefined {
  if (!dataUrl) return undefined
  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) return dataUrl

  const [, mime, , base64] = match
  const ext = EXTENSION_BY_MIME[mime.toLowerCase()] ?? 'bin'
  const filename = `${crypto.randomUUID()}.${ext}`
  fs.writeFileSync(path.join(mediaDir, filename), Buffer.from(base64, 'base64'))
  return `${baseUrl}/media/${filename}`
}
