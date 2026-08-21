import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export const userNav = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/quizzes', icon: 'clipboard', label: 'Quizzes' },
  { to: '/live', icon: 'bolt', label: 'Live Quiz' },
  { to: '/results', icon: 'trophy', label: 'Results' },
  { to: '/account', icon: 'user', label: 'Account' },
]

// Mobile bottom tab bar items.
export const userNavMobile = [
  { to: '/dashboard', icon: 'dashboard', label: 'Home' },
  { to: '/quizzes', icon: 'clipboard', label: 'Quizzes' },
  { to: '/live', icon: 'bolt', label: 'Live' },
  { to: '/results', icon: 'trophy', label: 'Results' },
  // { to: '/account', icon: '👤', label: 'Account' },
]

const adminNav = [
  { to: '/admin', icon: 'dashboard', label: 'Dashboard' },
  { to: '/admin/quizzes', icon: 'clipboard', label: 'Manage Quizzes' },
  { to: '/admin/results', icon: 'chart', label: 'Results' },
  { to: '/admin/analytics', icon: 'analytics', label: 'Analytics' },
  { to: '/admin/groups', icon: 'users', label: 'Groups' },
  { to: '/admin/grading', icon: 'file', label: 'Grading Queue' },
  { to: '/admin/users', icon: 'user', label: 'Users' },
  { to: '/admin/live', icon: 'bolt', label: 'Live Quiz' },
  { to: '/account', icon: 'user', label: 'Account' },
]

const iconPaths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7z" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
  analytics: <><path d="M4 19V5M4 19h16" /><path d="M8 16v-4M12 16V8M16 16v-7" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M16.5 14.5a5 5 0 0 1 4 5.5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
}

export function NavIcon({ name, className = '' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{iconPaths[name] || iconPaths.dashboard}</svg>
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { pathname } = useLocation()
  const nav = user?.is_admin ? adminNav : userNav

  return (
    <aside className="hidden md:flex fixed left-4 top-4 bottom-4 w-64 z-40 flex-col glass-panel p-4 animate-fade-up">
      <div className="px-2 pt-2 pb-5 border-b border-white/10 mb-4">
        <h1 className="font-head font-extrabold text-xl tracking-tight text-white">
          Quiz<span className="text-accent-400">Master</span>
        </h1>
        <div className="text-xs text-white/40 mt-1">
          {user?.is_admin ? 'Administrator workspace' : 'Student workspace'}
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {nav.map(item => {
          const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to) && item.to.length > 7)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200
                ${active
                  ? 'bg-white/[0.09] text-white shadow-inner-glass border border-white/10'
                  : 'text-white/50 hover:text-white/85 hover:bg-white/[0.05] border border-transparent'}`}
            >
              <span className="sidebar-nav-icon"><NavIcon name={item.icon} /></span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t border-white/10">
        <div className="theme-toggle mb-3" role="group" aria-label="Choose theme">
          {[
            { value: 'space', icon: '✦', label: 'Space theme' },
            { value: 'midnight', icon: '☾', label: 'Midnight theme' },
            { value: 'light', icon: '☀', label: 'Light theme' },
          ].map(item => (
            <button
              key={item.value}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={theme === item.value}
              className={theme === item.value ? 'is-active' : ''}
              onClick={() => setTheme(item.value)}
            >
              <span aria-hidden="true">{item.icon}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 mb-3">
          <Link
            to="/account"
            className="w-9 h-9 rounded-full shrink-0 overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center"
          >
            {user?.profile_url ? (
              <img src={user.profile_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-head font-bold text-sm text-white/50">
                {(user?.username || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
          </Link>
          <div className="text-xs text-white/40 min-w-0">
            <div className="font-semibold text-white/75 truncate">{user?.username}</div>
            <div className="truncate">{user?.email}</div>
          </div>
        </div>
        {/* <button className="btn btn-ghost w-full justify-start gap-2" onClick={logout}>
          <span>↩</span> Logout
        </button> */}
      </div>
    </aside>
  )
}
