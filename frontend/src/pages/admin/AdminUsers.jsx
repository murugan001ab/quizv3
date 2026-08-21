import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { Loading } from '../../components/Shared'

export default function AdminUsers() {
  const { user: me } = useAuth()
  const { adminUsers } = useData()
  const [search, setSearch] = useState('')

  useEffect(() => { adminUsers.load() }, [])

  const users     = adminUsers.data ?? []
  const firstLoad = adminUsers.data === null && adminUsers.loading
  if (firstLoad) return <Loading />

  const admins  = users.filter(u => u.is_admin).length
  const regular = users.length - admins
  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Users</h1>
        <p className="page-sub">All registered accounts on the platform</p>
      </div>

      <div className="stats-grid fade-up-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '2rem' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--blue)' }}>
          <div className="stat-label">Total Users</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{users.length}</div>
          <div className="stat-sub">Registered accounts</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div className="stat-label">Students</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{regular}</div>
          <div className="stat-sub">Regular users</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--yellow)' }}>
          <div className="stat-label">Admins</div>
          <div className="stat-value" style={{ color: 'var(--yellow)' }}>{admins}</div>
          <div className="stat-sub">Administrator accounts</div>
        </div>
      </div>

      <div className="fade-up-2" style={{ marginBottom: '1.25rem' }}>
        <input className="input" placeholder="🔍  Search by username or email..."
          value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 400 }} />
      </div>

      <div className="card fade-up-3" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>User</th><th>Email</th><th>Role</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No users found.</td></tr>
                : filtered.map((u, i) => (
                  <tr key={u.id} className="fade-up" style={{ animationDelay: `${i * 0.02}s` }}>
                    <td style={{ color: 'var(--text3)', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '0.8rem' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: u.is_admin ? 'rgba(251,191,36,0.15)' : 'var(--accent-dim)',
                          border: `1px solid ${u.is_admin ? 'rgba(251,191,36,0.3)' : 'rgba(110,231,183,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.75rem',
                          color: u.is_admin ? 'var(--yellow)' : 'var(--accent)', flexShrink: 0,
                        }}>{u.username.charAt(0).toUpperCase()}</div>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {u.username}
                          {u.id === me?.id && <span style={{ marginLeft: '0.375rem', fontSize: '0.7rem', color: 'var(--accent)', opacity: 0.7 }}>(you)</span>}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>{u.email}</td>
                    <td>
                      {u.is_admin
                        ? <span style={{ padding: '0.2rem 0.625rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(251,191,36,0.1)', color: 'var(--yellow)' }}>🛡 Admin</span>
                        : <span style={{ padding: '0.2rem 0.625rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)' }}>🎓 Student</span>
                      }
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
