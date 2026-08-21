import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api'

const MAX_EVENTS = 50

// Build the WebSocket URL for /ws/admin.
// Bug fix: this used to be hardcoded to the production domain
// (wss://quiz.mpcashews.in/...), which meant it never worked against a
// local/dev backend (Vite's /ws proxy was configured but ignored) and
// would silently break again on any other deployment domain.
// VITE_API_URL (same env var used for REST calls) is reused here so ws/http
// always point at the same backend; falling back to same-origin lets the
// Vite dev proxy (see vite.config.js) do its job.
function buildAdminWsUrl(token) {
  const apiBase = import.meta.env.VITE_API_URL || ''
  if (apiBase) {
    const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/$/, '')
    return `${wsBase}/ws/admin?token=${token}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws/admin?token=${token}`
}

function EventCard({ ev, i }) {
  const isStart = ev.type === 'quiz_started'
  const color  = isStart ? 'var(--blue)'   : 'var(--accent)'
  const bg     = isStart ? 'rgba(96,165,250,0.1)' : 'var(--accent-dim)'
  const border = isStart ? 'rgba(96,165,250,0.3)' : 'rgba(110,231,183,0.3)'
  const icon   = isStart ? '▶' : '✓'
  const pct    = !isStart && ev.total ? Math.round((ev.score / ev.total) * 100) : null
  const scoreColor = pct == null ? null
    : pct >= 80 ? 'var(--accent)' : pct >= 60 ? 'var(--blue)'
    : pct >= 40 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div className="fade-up" style={{
      animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
      display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
      padding: '0.875rem 1rem',
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-sm)',
    }}>
      {/* Icon */}
      <span style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: bg, border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 700, color,
      }}>{icon}</span>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: user + action + quiz title + timestamp */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{ev.user}</span>
            <span style={{ color: 'var(--text3)', margin: '0 0.35rem' }}>
              {isStart ? 'started' : 'submitted'}
            </span>
            <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{ev.quiz_title}</span>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text3)', flexShrink: 0, paddingTop: '0.1rem' }}>
            {new Date(ev.ts).toLocaleTimeString()}
          </span>
        </div>

        {/* Bottom row: score + badges */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.375rem', flexWrap: 'wrap' }}>
          {!isStart && ev.score != null && (
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.875rem', color: scoreColor }}>
              {ev.score}/{ev.total}
              <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text3)', marginLeft: '0.25rem' }}>
                ({pct}%)
              </span>
            </span>
          )}
          {ev.subject && (
            <span style={{
              padding: '0.1rem 0.45rem', borderRadius: 4,
              fontSize: '0.68rem', fontWeight: 600,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              color: 'var(--text3)',
            }}>{ev.subject}</span>
          )}
          {ev.difficulty && (
            <span style={{
              padding: '0.1rem 0.45rem', borderRadius: 4,
              fontSize: '0.68rem', fontWeight: 600,
              background: ev.difficulty === 'easy'   ? 'rgba(52,211,153,0.1)'
                        : ev.difficulty === 'hard'   ? 'var(--red-dim)'
                        : 'rgba(251,191,36,0.1)',
              color: ev.difficulty === 'easy'   ? 'var(--accent2)'
                   : ev.difficulty === 'hard'   ? 'var(--red)'
                   : 'var(--yellow)',
            }}>{ev.difficulty}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminMonitor() {
  const { token } = useAuth()
  const [events, setEvents]       = useState([])
  const [connected, setConnected] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Connecting…')
  // Attempts currently in progress. Seeded from GET /admin/live on mount so
  // the count is correct immediately — not just events seen since this tab
  // connected — then kept up to date from WS events as they arrive.
  const [liveIds, setLiveIds] = useState(() => new Set())
  const wsRef      = useRef(null)
  const reconnectRef = useRef(null)

  const liveCount = liveIds.size

  // Hydrate current live state on mount (and refresh alongside reconnects)
  useEffect(() => {
    api.adminLive(token)
      .then(attempts => setLiveIds(new Set(attempts.map(a => a.id))))
      .catch(() => {})
  }, [token])

  const connect = useCallback(() => {
    // Clear any pending reconnect timer
    if (reconnectRef.current) clearTimeout(reconnectRef.current)

    // Close stale socket without triggering our onclose handler
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
    }

    const url = buildAdminWsUrl(token)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setStatusMsg('Connected')
    }

    ws.onmessage = (e) => {
      let ev
      try { ev = JSON.parse(e.data) } catch { return }

      // Ignore server keep-alive pings
      if (ev.type === 'ping') return

      // Only handle known event types
      if (ev.type !== 'quiz_started' && ev.type !== 'quiz_submitted') return

      // Stamp ts if backend somehow omits it (shouldn't happen after fix)
      if (!ev.ts) ev.ts = new Date().toISOString()

      setEvents(prev => [ev, ...prev].slice(0, MAX_EVENTS))

      // Keep the live set in sync with real-time events too, so someone
      // starting/submitting mid-session updates the count immediately
      // without waiting for the next /admin/live poll.
      setLiveIds(prev => {
        const next = new Set(prev)
        if (ev.type === 'quiz_started') next.add(ev.attempt_id)
        if (ev.type === 'quiz_submitted') next.delete(ev.attempt_id)
        return next
      })
    }

    ws.onclose = () => {
      setConnected(false)
      setStatusMsg('Disconnected — reconnecting in 3 s…')
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setStatusMsg('Connection error')
      // onclose fires right after onerror, so reconnect is handled there
    }
  }, [token])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
      }
    }
  }, [connect])

  const manualReconnect = () => {
    setStatusMsg('Reconnecting…')
    connect()
  }

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-header fade-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Live Monitor</h1>
            <p className="page-sub">Real-time quiz activity via WebSocket</p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Live count pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.35rem 0.875rem',
              background: liveCount > 0 ? 'var(--accent-dim)' : 'var(--bg3)',
              border: `1px solid ${liveCount > 0 ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
              borderRadius: 999, fontSize: '0.8rem', fontWeight: 600,
              color: liveCount > 0 ? 'var(--accent)' : 'var(--text3)',
            }}>
              {liveCount > 0 && <span className="live-dot" />}
              {liveCount} live
            </span>

            {/* Connection status pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.35rem 0.875rem',
              background: connected ? 'rgba(52,211,153,0.08)' : 'var(--red-dim)',
              border: `1px solid ${connected ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.3)'}`,
              borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
              color: connected ? 'var(--accent2)' : 'var(--red)',
            }}>
              {connected ? '●' : '○'} {statusMsg}
            </span>

            <button className="btn btn-ghost btn-sm" onClick={manualReconnect}>Reconnect</button>
            {events.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEvents([])}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="fade-up-1" style={{
        display: 'flex', gap: '1.25rem', marginBottom: '1.25rem',
        fontSize: '0.78rem', color: 'var(--text3)', flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />
          quiz_started
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          quiz_submitted
        </span>
        <span style={{ marginLeft: 'auto' }}>Showing latest {Math.min(events.length, MAX_EVENTS)} of {MAX_EVENTS} max</span>
      </div>

      {/* Event feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {events.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '5rem 2rem',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text3)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}>📡</div>
            <div style={{ fontSize: '1rem', color: 'var(--text2)', marginBottom: '0.375rem' }}>
              {connected ? 'Waiting for activity…' : statusMsg}
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              Events appear here as users start and submit quizzes.
            </div>
          </div>
        ) : (
          events.map((ev, i) => (
            <EventCard key={`${ev.attempt_id}-${ev.type}-${ev.ts}`} ev={ev} i={i} />
          ))
        )}
      </div>
    </div>
  )
}
