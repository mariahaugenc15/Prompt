import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { BackIcon, BellIcon } from '../components/Icons'
import { enablePushNotifications, pushSupported } from '../lib/push'
import {
  getNotificationPrefs,
  setNotificationPrefs,
  getNotifications,
  markNotificationsRead,
  type NotificationPrefs,
  type NotificationItem,
} from '../lib/notificationsApi'

const TOGGLES: { key: keyof Omit<NotificationPrefs, 'master'>; label: string }[] = [
  { key: 'newFollower', label: 'New follower' },
  { key: 'newPrompt', label: 'New prompt received' },
  { key: 'promptCompleted', label: 'Someone completed your prompt' },
]

export function Notifications() {
  const account = useStore((s) => s.account)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notifStatus, setNotifStatus] = useState<'idle' | 'busy' | 'on' | 'denied' | 'unsupported'>(() =>
    pushSupported() ? (Notification.permission === 'granted' ? 'on' : 'idle') : 'unsupported',
  )

  useEffect(() => {
    if (!account) return
    getNotificationPrefs(account.token).then((res) => {
      if (res.ok) setPrefs(res.data)
    })
    getNotifications(account.token).then((res) => {
      if (res.ok) setItems(res.data.items)
      setLoading(false)
    })
    // Opening this page is the "I looked" signal — clears the unread badge
    // in AppHeader without needing a separate "mark read" action.
    markNotificationsRead(account.token)
  }, [account])

  async function updatePref(key: keyof NotificationPrefs, value: boolean) {
    if (!account || !prefs) return
    setPrefs({ ...prefs, [key]: value })
    const res = await setNotificationPrefs({ [key]: value }, account.token)
    if (res.ok) setPrefs(res.data)
  }

  async function handleEnablePush() {
    if (!account) return
    setNotifStatus('busy')
    const result = await enablePushNotifications(account.token)
    setNotifStatus(result === 'subscribed' ? 'on' : result === 'denied' ? 'denied' : result === 'unsupported' ? 'unsupported' : 'idle')
  }

  if (!account) return null

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to="/profile/edit" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back
      </Link>
      <h1 className="font-serif text-2xl leading-none">Notifications</h1>

      {notifStatus !== 'unsupported' && notifStatus !== 'on' && (
        <button
          onClick={handleEnablePush}
          disabled={notifStatus === 'busy'}
          className="flex items-center gap-3 rounded-sm border border-line bg-card p-3 text-left disabled:opacity-70"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-dim text-ink-soft">
            <BellIcon size={15} />
          </span>
          <span className="text-sm">
            {notifStatus === 'busy'
              ? 'Requesting…'
              : notifStatus === 'denied'
                ? 'Push is blocked in your browser settings. Turn it on there to get notified even when the app is closed.'
                : 'Turn on push, so you still hear about this when the app is closed.'}
          </span>
        </button>
      )}

      {prefs && (
        <section className="rounded-sm border border-line bg-card p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-ink-faint">Settings</p>
          <label className="flex items-center justify-between border-b border-line py-2.5 text-sm font-medium">
            All notifications
            <input
              type="checkbox"
              checked={prefs.master}
              onChange={(e) => updatePref('master', e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
          {TOGGLES.map(({ key, label }) => (
            <label
              key={key}
              className={clsx('flex items-center justify-between py-2.5 text-sm', !prefs.master && 'opacity-40')}
            >
              {label}
              <input
                type="checkbox"
                checked={prefs[key]}
                disabled={!prefs.master}
                onChange={(e) => updatePref(key, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            </label>
          ))}
        </section>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Recent</p>
        {loading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((n) => (
              <div key={n.id} className="rounded-sm border border-line bg-card px-3 py-2.5">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
