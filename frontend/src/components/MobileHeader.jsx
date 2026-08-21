import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Compact top bar shown only on mobile (< md). The desktop Sidebar carries
// the logo, profile summary and logout there; on mobile those live here so
// they're reachable without a drawer.
export default function MobileHeader() {
  const { user } = useAuth()

  return (
    <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 h-14 glass border-b border-white/10">
      <Link to={user?.is_admin ? '/admin' : '/dashboard'} className="flex items-center gap-2 min-w-0">
        <span className="font-head font-extrabold text-base tracking-tight text-white whitespace-nowrap">
          Quiz<span className="text-accent-400">Master</span>
        </span>
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/account"
          className="w-8 h-8 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center"
        >
          {user?.profile_url ? (
            <img src={user.profile_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-head font-bold text-xs text-white/50">
              {(user?.username || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </Link>
      
      </div>
    </header>
  )
}
