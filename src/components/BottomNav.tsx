import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { CalendarIcon, GridIcon, BoardsIcon, UserIcon } from './Icons'

const tabs = [
  { to: '/', label: 'Calendar', icon: CalendarIcon, end: true },
  { to: '/feed', label: 'Feed', icon: GridIcon },
  { to: '/boards', label: 'Boards', icon: BoardsIcon },
  { to: '/profile', label: 'Profile', icon: UserIcon },
]

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] transition',
                  isActive ? 'text-ink' : 'text-ink-faint',
                )
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
