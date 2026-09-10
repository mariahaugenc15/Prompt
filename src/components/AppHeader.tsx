import { Link } from 'react-router-dom'
import { PromptLogo } from './PromptLogo'

// The wordmark doubles as a home link on every page that renders this
// header (both the mock app's Shell and the real-account pages' RealShell)
// — a standard, always-available way out, since some real-account pages
// (org page, real inbox, send) have no bottom nav of their own.
export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-center border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
      <Link to="/">
        <PromptLogo size={19} />
      </Link>
    </header>
  )
}
