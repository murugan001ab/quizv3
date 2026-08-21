import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api'
import { Loading } from '../../components/Shared'

function StatCard({ label, value, sub, color, icon, delay = 0 }) {
  return (
    <div className="stat-card fade-up" style={{ animationDelay: `${delay}s`, borderLeft: `3px solid ${color || 'var(--accent)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color: color || 'var(--text)' }}>{value}</div>
          <div className="stat-sub">{sub}</div>
        </div>
        <div style={{ fontSize: '1.5rem', opacity: 0.5 }}>{icon}</div>
      </div>
    </div>
  )
}

function ActivityRow({ a, i }) {
  const pct   = a.total ? Math.round((a.score / a.total) * 100) : 0
  const color = pct >= 80 ? 'var(--accent)' : pct >= 60 ? 'var(--blue)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)'
  return (
    <div className="fade-up" style={{
      animationDelay: `${i * 0.04}s`,
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.625rem 0.75rem',
      background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)', fontSize: '0.85rem',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--card2)', border: '1px solid var(--border2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.7rem',
        color: 'var(--text2)', flexShrink: 0,
      }}>
        {(a.user?.username || 'U').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.user?.username || '—'}
        </div>
        <div style={{ color: 'var(--text3)', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.quiz_title || 'Unknown Quiz'}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {a.submitted_at ? (
          <>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color, fontSize: '0.875rem' }}>{pct}%</div>
            <div style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>{a.score}/{a.total}</div>
          </>
        ) : (
          <span style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.15rem 0.5rem', borderRadius: 999 }}>In Progress</span>
        )}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { token }   = useAuth()
  const navigate    = useNavigate()
  const { adminStats, adminQuizzes } = useData()
  const [localAttempts, setLocalAttempts] = useState([])
  const intervalRef = useRef(null)

  // Load the most recent attempts across ALL quizzes (not just a handful),
  // newest submissions first. Previously this only checked the first 5
  // quizzes returned by the unordered /admin/quizzes list, so quizzes
  // created later — even if heavily attempted — never showed up here.
  const loadAttempts = async () => {
    try {
      const attempts = await api.adminAttempts(token, 50)
      setLocalAttempts(attempts)
    } catch {
      setLocalAttempts([])
    }
  }

  useEffect(() => {
    adminStats.load()
    adminQuizzes.load()
    loadAttempts()
  }, [])

  // Only refresh lightweight stats counter periodically
  useEffect(() => {
    intervalRef.current = setInterval(() => adminStats.refresh(), 20_000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const stats     = adminStats.data
  const firstLoad = adminStats.data === null && adminStats.loading
  if (firstLoad) return <Loading />

  // Export the currently loaded attempts (username, percent score, submitted date)
  // as a downloadable .xlsx report.
  const exportAttemptsToExcel = () => {
    if (!localAttempts.length) return

    const rows = localAttempts.map(a => ({
      'User Name': a.user?.username || '—',
      'Full Name': a.user?.name || '—',
      'Email': a.user?.email || '—',
      'Percent Score': a.submitted_at && a.total
        ? `${Math.round((a.score / a.total) * 100)}%`
        : 'In Progress',
      'Submitted On': a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 28 }, { wch: 15 }, { wch: 22 }]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quiz Attempts')

    const timestamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `quiz_attempts_report_${timestamp}.xlsx`)
  }

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-sub">Platform overview — stats refresh every 20 s</p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <StatCard label="Total Users"    value={stats?.total_users    ?? '—'} sub="Registered accounts" icon="👥" color="var(--blue)"    delay={0}    />
        <StatCard label="Total Quizzes"  value={stats?.total_quizzes  ?? '—'} sub="Created quizzes"     icon="📋" color="var(--accent)"  delay={0.05} />
        <StatCard label="Live Right Now" value={stats?.live_takers    ?? 0}   sub="Currently testing"   icon="📡" color="var(--yellow)"  delay={0.1}  />
        <StatCard label="Total Attempts" value={stats?.total_attempts ?? '—'} sub="All submissions"     icon="✅" color="var(--accent2)" delay={0.15} />
        <StatCard label="Grading Pending" value={stats?.grading_pending ?? 0} sub="Essay answers to review" icon="📝" color="var(--yellow)" delay={0.2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card fade-up-1">
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { icon: '📋', label: 'Manage Quizzes', sub: 'Create, edit & delete quizzes', to: '/admin/quizzes' },
              { icon: '📝', label: 'Grading Queue',  sub: `${stats?.grading_pending ?? 0} essay answer(s) awaiting review`, to: '/admin/grading' },
              { icon: '👥', label: 'View Users',     sub: 'Browse all registered users',   to: '/admin/users'   },
              { icon: '📡', label: 'Live Monitor',   sub: 'Watch quiz activity in real time', to: '/admin/monitor' },
            ].map(item => (
              <button key={item.to} onClick={() => navigate(item.to)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                  padding: '0.875rem 1rem', background: 'var(--bg3)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'all var(--transition)', color: 'var(--text)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--card2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.background = 'var(--bg3)'  }}
              >
                <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.label}</div>
                  <div style={{ color: 'var(--text3)', fontSize: '0.75rem' }}>{item.sub}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>→</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card fade-up-2">
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Platform Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { label: 'API Server',       status: 'Online',    ok: true },
              { label: 'Database',         status: 'Connected', ok: true },
              { label: 'WebSocket',        status: 'Active',    ok: true },
              { label: 'Live Test Takers', status: `${stats?.live_takers ?? 0} active`, ok: true },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text2)' }}>{s.label}</span>
                <span style={{
                  padding: '0.2rem 0.625rem', borderRadius: 999,
                  fontSize: '0.72rem', fontWeight: 600,
                  background: s.ok ? 'rgba(52,211,153,0.1)' : 'var(--red-dim)',
                  color: s.ok ? 'var(--accent2)' : 'var(--red)',
                }}>● {s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card fade-up-3">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem' }}>Recent Attempts</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {localAttempts.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={exportAttemptsToExcel}>Export to Excel ⬇</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/quizzes')}>View Quizzes →</button>
          </div>
        </div>
        {localAttempts.length === 0
          ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)', fontSize: '0.875rem' }}>No recent attempts yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {localAttempts.slice(0, 8).map((a, i) => <ActivityRow key={a.id || i} a={a} i={i} />)}
            </div>
        }
      </div>
    </div>
  )
}
