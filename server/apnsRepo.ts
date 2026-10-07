import crypto from 'node:crypto'
import http2 from 'node:http2'
import { db } from './db.js'

// APNs (Apple Push Notification service) is how a silent, invisible push
// reaches the native iOS app so it can refresh the home-screen widget's
// data in the background. Web Push (pushRepo.ts) only reaches a browser
// or installed PWA, never a Capacitor-wrapped native app. This talks to
// Apple directly over HTTP/2 with a token-based (.p8 key) auth, the same
// mechanism Apple's own docs describe, rather than adding a third-party
// APNs client dependency, since the protocol itself is a handful of headers
// and a JWT, not worth a new dependency for.
//
// Requires three env vars from the Apple Developer account that owns this
// app's bundle id (APNS_BUNDLE_ID defaults to the one in
// capacitor.config.ts): APNS_TEAM_ID (the 10-character Team ID),
// APNS_KEY_ID (the Key ID of an APNs Auth Key), and APNS_PRIVATE_KEY (the
// full contents of that key's downloaded .p8 file, including the
// -----BEGIN/END PRIVATE KEY----- lines). Generate the key once under
// Certificates, Identifiers & Profiles → Keys in the Apple Developer
// portal (it can sign push for every app on the team, so one key covers
// this app indefinitely). Without these set, every function here is a
// silent no-op, since there's no native app build to reach in dev anyway.
const APNS_HOST = process.env.APNS_HOST ?? 'api.push.apple.com'
const APNS_TEAM_ID = process.env.APNS_TEAM_ID
const APNS_KEY_ID = process.env.APNS_KEY_ID
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'com.promptsocial.app'

const configured = Boolean(APNS_TEAM_ID && APNS_KEY_ID && APNS_PRIVATE_KEY)

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedToken: { token: string; issuedAt: number } | undefined

// Apple asks that the same auth JWT be reused for up to an hour rather
// than minted fresh per push: these tokens are cheap to verify on
// Apple's side specifically because they're meant to be long-lived.
function authToken(): string {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now - cachedToken.issuedAt < 55 * 60) return cachedToken.token
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
  const claims = base64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }))
  // ES256 (JWT) signatures are raw r||s ("IEEE P1363"), not the DER format
  // crypto.sign produces by default for an EC key.
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: APNS_PRIVATE_KEY!,
    dsaEncoding: 'ieee-p1363',
  })
  const token = `${header}.${claims}.${base64url(signature)}`
  cachedToken = { token, issuedAt: now }
  return token
}

const upsertToken = db.prepare(`
  INSERT INTO apns_device_tokens (device_token, account_id, created_at)
  VALUES (@deviceToken, @accountId, @createdAt)
  ON CONFLICT(device_token) DO UPDATE SET account_id = @accountId
`)
const deleteToken = db.prepare('DELETE FROM apns_device_tokens WHERE device_token = ?')
const deleteTokensForAccount = db.prepare('DELETE FROM apns_device_tokens WHERE account_id = ?')
const tokensForAccount = db.prepare('SELECT device_token FROM apns_device_tokens WHERE account_id = ?')

export function saveApnsToken(accountId: string, deviceToken: string): void {
  upsertToken.run({ deviceToken, accountId, createdAt: Date.now() })
}

export function removeApnsToken(deviceToken: string): void {
  deleteToken.run(deviceToken)
}

// Same cleanup occasions as pushRepo.ts's removeSubscriptionsForAccount:
// logout, account deletion, and the Phase 6 permanent-delete cascade.
export function removeApnsTokensForAccount(accountId: string): void {
  deleteTokensForAccount.run(accountId)
}

interface ApnsTokenRow {
  device_token: string
}

function sendOne(deviceToken: string, jwt: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const client = http2.connect(`https://${APNS_HOST}`)
    client.on('error', finish)
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      // "background" (silent) push: no banner/sound, just wakes the app to
      // run its background-fetch handler, see AppDelegate.swift.
      'apns-push-type': 'background',
      'apns-priority': '5',
    })
    let status = 0
    let body = ''
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0)
    })
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('error', finish)
    req.on('end', () => {
      // A stale/uninstalled-app token reports 410 Gone, or 400
      // BadDeviceToken, the same "clean it up and move on" handling as
      // pushRepo.ts's expired Web Push subscriptions.
      if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) {
        removeApnsToken(deviceToken)
      } else if (status && status !== 200) {
        console.error('APNs send failed', status, body)
      }
      client.close()
      finish()
    })
    req.write(JSON.stringify({ aps: { 'content-available': 1 }, type: 'widget-refresh' }))
    req.end()
  })
}

// Best-effort, fire-and-forget: same contract as pushRepo.ts's
// notifyAccount: never anything the caller awaits failure from, since the
// triggering event (a new prompt, a follow, a completion) already
// succeeded regardless of whether the widget ends up refreshed.
export async function sendWidgetRefreshPush(accountId: string): Promise<void> {
  if (!configured) return
  const rows = tokensForAccount.all(accountId) as ApnsTokenRow[]
  if (rows.length === 0) return
  const jwt = authToken()
  await Promise.all(rows.map((row) => sendOne(row.device_token, jwt)))
}
