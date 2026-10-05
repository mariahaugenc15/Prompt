import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { PromptLogo } from './PromptLogo'
import { BellIcon } from './Icons'
import { getNotifications } from '../lib/notificationsApi'

const POLL_MS = 30000

// The wordmark doubles as a home link on every page that renders this
// header (both the mock app's Shell and the real-account pages' RealShell)
// — a standard, always-available way out, since some real-account pages
// (org page, real inbox, send) have no bottom nav of their own.
export function AppHeader() {
  const account = useStore((s) => s.account)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!account) return
    let cancelled = false
    function poll() {
      getNotifications(account!.token, 0, 1).then((res) => {
        if (!cancelled && res.ok) setUnreadCount(res.data.unreadCount)
      })
    }
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [account])

  return (
    <header className="sticky top-0 z-20 flex items-center justify-center border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
      <Link to="/">
        <PromptLogo size={19} />
      </Link>
      {account && (
        <Link to="/notifications" aria-label="Notifications" className="absolute right-4 flex items-center">
          <span className="relative text-ink-soft">
            <BellIcon size={19} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-medium text-paper">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
        </Link>
      )}
    </header>
  )
}
