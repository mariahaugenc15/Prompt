import { getPushPublicKey, subscribeToPush } from './realAccountsApi'

// A VAPID public key arrives from the server as URL-safe base64 (see
// pushRepo.ts / web-push's own format) — the Push API wants raw bytes.
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type PushEnableResult = 'subscribed' | 'denied' | 'unsupported' | 'error'

// Only ever called from a user gesture (a button press) — browsers reject
// or silently ignore a permission prompt fired from a page-load effect,
// and it's a worse experience even when they don't.
export async function enablePushNotifications(token: string): Promise<PushEnableResult> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const registration = await navigator.serviceWorker.ready
    const keyRes = await getPushPublicKey()
    if (!keyRes.ok) return 'error'

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
      })
    }

    const res = await subscribeToPush(subscription.toJSON() as PushSubscriptionJSON, token)
    return res.ok ? 'subscribed' : 'error'
  } catch {
    return 'error'
  }
}

export function pushSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}
