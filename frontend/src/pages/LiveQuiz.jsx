import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLiveSocket } from '../hooks/useLiveSocket'
import { useParams } from 'react-router-dom'
import { shuffleIndices } from '../utils/shuffle'
const KEYS = ['A', 'B', 'C', 'D']


const STORAGE_PREFIX = 'liveQuiz:lastChannel:'

function loadStoredChannel(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStoredChannel(userId, data) {
  if (!userId) return
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(data))
  } catch {
  }
}

function clearStoredChannel(userId) {
  if (!userId) return
  try {
    localStorage.removeItem(STORAGE_PREFIX + userId)
  } catch {
  }
}

function ResumeCard({ channelName, onResume, onJoinDifferent, resuming }) {
  return (
    <div className="glass-panel fade-up max-w-[420px] my-8 mx-auto p-6">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-1">
            You were in a live quiz
          </div>
          <h2 className="font-head font-bold">
            {channelName || 'Live quiz'}
          </h2>
          <div className="text-white/40 text-sm mt-1">
            Looks like you got disconnected. You're still logged in, so you can jump right back in.
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={onResume} disabled={resuming}>
          {resuming ? 'Resuming…' : 'Resume live quiz'}
        </button>
        <button className="btn btn-ghost w-full" onClick={onJoinDifferent}>
          Join a different channel instead
        </button>
      </div>
    </div>
  )
}

function JoinForm({ onJoin }) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="glass-panel fade-up max-w-[420px] my-8 mx-auto p-6">
      <div className="flex flex-col gap-4">
        <div className="input-group">
          <label className="input-label">Channel code</label>
          <input
            className="input font-head font-bold tracking-[0.1em]"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7F3K2Q"
          />
        </div>
        <div className="input-group">
          <label className="input-label">Password (if the host set one)</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={!code.trim()} onClick={() => onJoin(code.trim(), password)}>
          Join live quiz
        </button>
      </div>
    </div>
  )
}

function WaitingRoom({ channelInfo, users }) {
  return (
    <div className="glass-panel fade-up max-w-[480px] my-8 mx-auto p-6">
      <h2 className="font-head font-bold mb-1">{channelInfo.name}</h2>
      <div className="text-white/40 text-sm mb-5">{channelInfo.quiz_title}</div>
      <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-2">
        Connected ({users.length})
      </div>
      <div className="flex flex-col gap-1.5 mb-5">
        {users.map(u => (
          <div key={u.user_id} className="flex justify-between px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
            <span>{u.username}</span>
            {u.is_admin && <span className="text-accent-400 text-xs">host</span>}
          </div>
        ))}
      </div>
      <div className="text-center text-white/40 text-sm">
        Waiting for the host to start the quiz…
      </div>
    </div>
  )
}

function LiveQuestionCard({ question, locked, onAnswer, order }) {
  const [selected, setSelected] = useState(null)
  const [timeLeft, setTimeLeft] = useState(question.time_limit)

  useEffect(() => {
    setSelected(null)
    setTimeLeft(question.time_limit)
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [question.id])

  // `displayIdx` is the on-screen (shuffled) position. `order[displayIdx]` is
  // the ORIGINAL option index, which is what we report to the server so
  // scoring/leaderboard stay correct regardless of this client's shuffle.
  const pick = (displayIdx) => {
    if (selected !== null || locked) return
    setSelected(displayIdx)
    onAnswer(question.index, order[displayIdx])
  }

  return (
    <div className="card fade-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text3)' }}>
        <span>Question {question.index + 1} of {question.total}</span>
        <span className={timeLeft <= 5 ? 'timer danger' : 'timer'}>⏱ {timeLeft}s</span>
      </div>
      <p style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '1rem' }}>{question.text}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {order.map((origIdx, displayIdx) => (
          <button
            key={displayIdx}
            className={`option-btn ${selected === displayIdx ? 'selected' : ''}`}
            onClick={() => pick(displayIdx)}
            disabled={selected !== null || locked}
          >
            <span className="option-key">{KEYS[displayIdx]}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{question.options[origIdx]}</span>
          </button>
        ))}
      </div>
      {locked && (
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text3)' }}>
          Answers locked — the correct answer will be revealed in the review after the quiz.
        </div>
      )}
    </div>
  )
}

function ExplainCard({ q, isAdmin, onPrev, onNext, order }) {
  const total = q.counts.reduce((a, b) => a + b, 0)
  return (
    <div className="card fade-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text3)' }}>
        <span>Review · Question {q.index + 1} of {q.total}</span>
      </div>
      <p style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '1rem' }}>{q.text}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {order.map((origIdx, displayIdx) => {
          const count = q.counts[origIdx] || 0
          const pct = total ? Math.round((count / total) * 100) : 0
          const isCorrect = origIdx === q.correct_option
          return (
            <div key={displayIdx} className="option-btn" style={{
              position: 'relative', overflow: 'hidden', cursor: 'default',
              background: isCorrect ? 'rgba(52,211,153,0.1)' : 'var(--bg3)',
              borderColor: isCorrect ? 'rgba(52,211,153,0.4)' : 'var(--border)',
            }}>
              <div style={{
                position: 'absolute', inset: 0, width: `${pct}%`,
                background: isCorrect ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', zIndex: 0,
              }} />
              <span className="option-key" style={{ position: 'relative' }}>{KEYS[displayIdx]}</span>
              <span style={{ flex: 1, textAlign: 'left', position: 'relative' }}>{q.options[origIdx]}</span>
              <span style={{ position: 'relative', fontFamily: 'var(--font-head)', fontWeight: 700 }}>{count} · {pct}%</span>
            </div>
          )
        })}
      </div>
      {q.explanation && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.875rem', color: 'var(--text2)' }}>
          {q.explanation}
        </div>
      )}
      {isAdmin && (
        <div className="flex justify-between" style={{ marginTop: '1.25rem' }}>
          <button className="btn btn-ghost" onClick={onPrev} disabled={q.index === 0}>← Previous</button>
          <button className="btn btn-primary" onClick={onNext} disabled={q.index >= q.total - 1}>Next →</button>
        </div>
      )}
    </div>
  )
}

function LeaderboardCard({ scores, finished }) {
  return (
    <div className="card fade-up" style={{ maxWidth: 480, margin: '2rem auto' }}>
      <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: '1rem' }}>
        {finished ? '🏆 Final results' : 'Leaderboard'}
      </h2>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: 0, listStyle: 'none' }}>
        {scores.map((s, i) => (
          <li key={s.username} style={{
            display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
            background: i === 0 && finished ? 'rgba(251,191,36,0.1)' : 'var(--bg3)',
            border: `1px solid ${i === 0 && finished ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
            borderRadius: 6,
          }}>
            <span>{i + 1}. {s.username}</span>
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{s.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function LiveQuiz() {
  const { token, user } = useAuth()
  const toast = useToast()
  const socket = useLiveSocket()
  const [joined, setJoined] = useState(false)
  const [resuming, setResuming] = useState(false)
  // Per-question option shuffle order, cached by question index so the same
  // client sees a stable shuffled order for a given question across the
  // "answer" phase and the later "explain" (review) phase. This does not
  // persist across reconnects/resumes by design — a fresh shuffle each time
  // is fine since it's purely cosmetic and doesn't affect scoring.
  const orderCacheRef = useRef({})
  const getOptionOrder = (q) => {
    if (!q) return []
    const key = q.index
    if (!orderCacheRef.current[key] || orderCacheRef.current[key].length !== q.options.length) {
      orderCacheRef.current[key] = shuffleIndices(q.options.length)
    }
    return orderCacheRef.current[key]
  }

  const [resumable, setResumable] = useState(() => loadStoredChannel(user?.id))

  const handleJoin = (code, password) => {
    saveStoredChannel(user?.id, { code, password: password || '', name: null })
    socket.join(code, token, password)
    setJoined(true)
  }

  const handleResume = () => {
    if (!resumable) return
    setResuming(true)
    socket.join(resumable.code, token, resumable.password)
    setJoined(true)
  }

  const handleJoinDifferent = () => {
    clearStoredChannel(user?.id)
    setResumable(null)
  }

  useEffect(() => {
    if (socket.error) {
      toast(socket.error, 'error')
      setJoined(false)
      setResuming(false)
      clearStoredChannel(user?.id)
      setResumable(null)
    }
  }, [socket.error])

  useEffect(() => {
    if (joined && socket.channelInfo && user?.id) {
      const existing = loadStoredChannel(user.id) || {}
      saveStoredChannel(user.id, { ...existing, name: socket.channelInfo.name })
    }
  }, [joined, socket.channelInfo, user?.id])


  const {code,link_token}=useParams()


  useEffect(() => {
    if (code && link_token && token && !joined) {
      saveStoredChannel(user?.id, { code, password: '', name: null })
      socket.join(code, token, null, link_token)
      setJoined(true)
    }
  }, [code, link_token, token])

  if (!joined) {
    return (
      <div className="page-wrap">
        {resumable ? (
          <ResumeCard
            channelName={resumable.name}
            onResume={handleResume}
            onJoinDifferent={handleJoinDifferent}
            resuming={resuming}
          />
        ) : (
          <JoinForm onJoin={handleJoin} />
        )}
      </div>
    )
  }

  const {
    channelInfo, users, quizState, question, locked, leaderboard,
    explainQuestion, isAdmin, submitAnswer, explainNext, explainPrev,
  } = socket

  return (
    <div className="page-wrap">
      {explainQuestion ? (
        <ExplainCard q={explainQuestion} isAdmin={isAdmin} onPrev={explainPrev} onNext={explainNext} order={getOptionOrder(explainQuestion)} />
      ) : quizState === 'finished' ? (
        <LeaderboardCard scores={leaderboard} finished />
      ) : quizState === 'waiting' || !question ? (
        channelInfo && <WaitingRoom channelInfo={channelInfo} users={users} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <LiveQuestionCard question={question} locked={locked} onAnswer={submitAnswer} order={getOptionOrder(question)} />
          {leaderboard.length > 0 && <LeaderboardCard scores={leaderboard} />}
        </div>
      )}
    </div>
  )
}
