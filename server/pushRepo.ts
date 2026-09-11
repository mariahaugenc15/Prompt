import webpush from 'web-push'
import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'

// VAPID identifies this server to the push services (Chrome/Firefox/etc.)
// that actually deliver the notification. In production, set
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (generate once with
// `npx web-push generate-vapid-keys`) so the keypair survives redeploys —
// every subscription a browser holds is bound to the public key it
// subscribed with, so rotating keys silently invalidates every existing
// subscription. Falls back to a keypair cached on local disk for dev, so
// at least a single long-running dev server has a stable identity.
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'server', '.data')
const devKeysPath = path.join(dataDir, 'vapid-keys.json')

function loadOrCreateDevKeys(): { publicKey: string; privateKey: string } {
  try {
    const raw = fs.readFileSync(devKeysPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    const keys = webpush.generateVAPIDKeys()
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(devKeysPath, JSON.stringify(keys))
    } catch {
      // best-effort caching only — a fresh keypair every restart is fine for dev
    }
    return keys
  }
}

const vapidKeys =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : loadOrCreateDevKeys()

webpush.setVapidDetails('mailto:support@example.com', vapidKeys.publicKey, vapidKeys.privateKey)

export function vapidPublicKey(): string {
  return vapidKeys.publicKey
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const upsertSubscription = db.prepare(`
  INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, created_at)
  VALUES (@endpoint, @accountId, @p256dh, @auth, @createdAt)
  ON CONFLICT(endpoint) DO UPDATE SET account_id = @accountId, p256dh = @p256dh, auth = @auth
`)
const deleteSubscription = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
const subscriptionsForAccount = db.prepare('SELECT * FROM push_subscriptions WHERE account_id = ?')

export function saveSubscription(accountId: string, sub: PushSubscriptionInput): void {
  upsertSubscription.run({ endpoint: sub.endpoint, accountId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: Date.now() })
}

export function removeSubscription(endpoint: string): void {
  deleteSubscription.run(endpoint)
}

interface SubscriptionRow {
  endpoint: string
  account_id: string
  p256dh: string
  auth: string
}

// Best-effort: a push failure (expired subscription, network hiccup) should
// never surface as an error to whoever triggered the notification — the
// prompt/broadcast itself already succeeded regardless.
export async function notifyAccount(accountId: string, title: string, body: string, url = '/'): Promise<void> {
  const subs = subscriptionsForAccount.all(accountId) as SubscriptionRow[]
  const payload = JSON.stringify({ title, body, url })
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          removeSubscription(sub.endpoint)
        } else {
          console.error('push send failed', err)
        }
      }
    }),
  )
}
