import { Link, useLocation } from 'react-router-dom'
import { userNavMobile } from './Sidebar'
import { useAuth } from '../context/AuthContext'

// Fixed bottom tab bar for mobile (< md). Admins keep using the desktop
// Sidebar-only experience for now since this pass is scoped to student-facing
// pages, so this only renders for non-admin users.
export default function BottomNav() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  if (user?.is_admin) return null

  return (
    <nav
      id="bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/10 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {userNavMobile.map(item => {
        const active = pathname === item.to || (pathname.startsWith(item.to) && item.to.length > 7)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[0.6rem] font-medium whitespace-nowrap transition-colors duration-150
              ${active ? 'text-accent-300' : 'text-white/45'}`}
          >
            <span className={`text-base leading-none transition-transform duration-150 ${active ? 'scale-110' : ''}`}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
