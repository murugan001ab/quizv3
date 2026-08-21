import { useCallback, useEffect, useRef, useState } from 'react'

// Same pattern as AdminMonitor's buildAdminWsUrl: reuse VITE_API_URL so the
// ws/http always point at the same backend, falling back to same-origin so
// the Vite dev proxy can do its job.
function buildLiveWsUrl(code, token, link_token) {
  const apiBase = import.meta.env.VITE_API_URL || ''
  if (apiBase) {
    const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/$/, '')
    return `${wsBase}/live/ws/${code}?token=${token}&link=${link_token}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/live/ws/${code}?token=${token}&link=${link_token}`
}

const HEARTBEAT_INTERVAL_MS = 5000
// If no message (including our own ping's implicit round trip) has been
// seen from the server in this long, treat the socket as dead even if the
// browser hasn't fired onclose yet (common with flaky wifi / sleeping tabs).
const HEARTBEAT_TIMEOUT_MS = 12000
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 15000

export function useLiveSocket() {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [channelInfo, setChannelInfo] = useState(null) // { code, name, quiz_title }
  const [users, setUsers] = useState([])
  const [quizState, setQuizState] = useState('waiting') // waiting | in_progress | finished
  const [question, setQuestion] = useState(null)
  const [correctIndex, setCorrectIndex] = useState(null)
  const [answerCounts, setAnswerCounts] = useState(null)
  const [locked, setLocked] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [explainQuestion, setExplainQuestion] = useState(null)
  const [error, setError] = useState('')

  // Everything needed to open (or reopen) the socket, plus bookkeeping for
  // the heartbeat/reconnect loop. Kept in refs (not state) so timers always
  // see the latest values without having to be re-created on every render.
  const joinArgsRef = useRef(null) // { code, token, password, link_token }
  const heartbeatTimerRef = useRef(null)
  const watchdogTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const manuallyClosedRef = useRef(false)
  const lastSeenRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current)
      watchdogTimerRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const connectRef = useRef(() => {})

  const scheduleReconnect = useCallback(() => {
    if (manuallyClosedRef.current) return
    if (reconnectTimerRef.current) return // already scheduled

    const attempt = reconnectAttemptsRef.current
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS)
    reconnectAttemptsRef.current = attempt + 1
    setReconnecting(true)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (!manuallyClosedRef.current && joinArgsRef.current) {
        connectRef.current()
      }
    }, delay)
  }, [])

  const startHeartbeat = useCallback(() => {
    lastSeenRef.current = Date.now()

    heartbeatTimerRef.current = setInterval(() => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
        } catch {
          /* send failed -- let the watchdog/onclose handle recovery */
        }
      }
    }, HEARTBEAT_INTERVAL_MS)

    // Since the channel isn't persistent (server can drop the socket
    // without a clean close frame reaching the client promptly), a
    // watchdog double-checks liveness independently of onclose.
    watchdogTimerRef.current = setInterval(() => {
      const ws = wsRef.current
      if (!ws) return
      const silentFor = Date.now() - lastSeenRef.current
      if (silentFor > HEARTBEAT_TIMEOUT_MS) {
        try { ws.close() } catch { /* ignore */ }
        // onclose below will pick up reconnection
      }
    }, HEARTBEAT_INTERVAL_MS)
  }, [])

  const connect = useCallback(() => {
    const args = joinArgsRef.current
    if (!args) return
    const { code, token, password, link_token } = args

    setError('')
    const ws = new WebSocket(buildLiveWsUrl(code, token, link_token))
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setReconnecting(false)
      reconnectAttemptsRef.current = 0
      lastSeenRef.current = Date.now()
      ws.send(JSON.stringify({ type: 'join', password: password || undefined }))
      startHeartbeat()
    }

    ws.onmessage = (event) => {
      lastSeenRef.current = Date.now()
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case 'joined':
          setChannelInfo(msg.channel)
          setIsAdmin(msg.is_admin)
          setQuizState(msg.channel.state)
          break
        case 'user_list':
          setUsers(msg.users)
          break
        case 'quiz_started':
          setQuizState('in_progress')
          setCorrectIndex(null)
          setLocked(false)
          break
        case 'question':
          setQuestion(msg)
          setCorrectIndex(null)
          setAnswerCounts(null)
          setLocked(false)
          break
        case 'question_locked':
          // Sent to participants: the round is over, but the correct answer
          // is withheld until the admin runs the explanation walkthrough.
          setLocked(true)
          break
        case 'question_ended':
          // Only the admin receives this (host-only review of the round).
          setCorrectIndex(msg.correct_index)
          setAnswerCounts(msg.counts || null)
          setLocked(true)
          break
        case 'leaderboard':
          setLeaderboard(msg.scores)
          break
        case 'quiz_ended':
          setQuizState('finished')
          setLeaderboard(msg.final_leaderboard)
          // Quiz is over — clear the in-progress question so stale "current
          // question" UI (host view) doesn't linger after finish.
          setQuestion(null)
          setCorrectIndex(null)
          setAnswerCounts(null)
          setLocked(false)
          break
        case 'explain_question':
          setExplainQuestion(msg)
          break
        case 'ping':
          // Server-side liveness probe (e.g. seat-reclaim check) -- reply so
          // it doesn't mistake us for stale, but it's not user-facing state.
          try { ws.send(JSON.stringify({ type: 'pong' })) } catch { /* ignore */ }
          break
        case 'pong':
          break
        case 'error':
          // These are fatal/logic errors (bad password, channel gone, already
          // connected elsewhere) that the server follows with a close --
          // not a transient network blip -- so don't let the reconnect loop
          // keep hammering the same failure.
          manuallyClosedRef.current = true
          joinArgsRef.current = null
          clearTimers()
          setError(msg.message)
          break
      }
    }

    ws.onclose = () => {
      setConnected(false)
      clearTimers()
      if (wsRef.current === ws) wsRef.current = null
      if (!manuallyClosedRef.current) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // Let onclose (which always follows onerror for a WebSocket) drive
      // the actual reconnect scheduling; this just avoids an unhandled
      // console error in some browsers.
    }
  }, [clearTimers, scheduleReconnect, startHeartbeat])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const join = useCallback((code, token, password, link_token) => {
    manuallyClosedRef.current = false
    reconnectAttemptsRef.current = 0
    joinArgsRef.current = { code, token, password, link_token }
    clearTimers()
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
    connect()
  }, [clearTimers, connect])

  const startQuiz = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'start_quiz' }))
  }, [])

  const submitAnswer = useCallback((index, optionIndex) => {
    wsRef.current?.send(JSON.stringify({ type: 'answer', index, option_index: optionIndex }))
  }, [])

  const startExplain = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'start_explain' }))
  }, [])

  const explainNext = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'explain_next' }))
  }, [])

  const explainPrev = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'explain_prev' }))
  }, [])

  const leave = useCallback(() => {
    manuallyClosedRef.current = true
    joinArgsRef.current = null
    clearTimers()
    try { wsRef.current?.send(JSON.stringify({ type: 'leave' })) } catch { /* ignore */ }
    wsRef.current?.close()
  }, [clearTimers])

  useEffect(() => () => {
    manuallyClosedRef.current = true
    clearTimers()
    wsRef.current?.close()
  }, [clearTimers])

  return {
    connected, reconnecting, isAdmin, channelInfo, users, quizState, question,
    correctIndex, answerCounts, locked, leaderboard, explainQuestion, error,
    join, startQuiz, submitAnswer, leave, startExplain, explainNext, explainPrev,
  }
}
