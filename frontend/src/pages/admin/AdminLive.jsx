import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useLiveSocket } from '../../hooks/useLiveSocket'
import { Loading, Spinner, CopyButton, Select } from '../../components/Shared'
import { useData } from '../../context/DataContext'
// Falls back to the current origin when VITE_URL isn't set (it's missing
// from .env.production), and is normalized to always end in exactly one
// slash so the concatenation below can't produce "...comlive/CODE" or
// "...com//live/CODE".
const FRONTEND_BASE = (import.meta.env.VITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/*$/, '/')
// ── Step 0: if this admin already has an open channel (e.g. they got
// disconnected, refreshed, or navigated away mid-session), let them
// reclaim it as host instead of being forced into creating a new one.
function MyChannelsPanel({ token,link, userId, toast, onRejoined,onCopy, refreshTick }) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(null) // code currently being rejoined
  const [passwords, setPasswords] = useState({}) // code -> password draft

  useEffect(() => {
    let cancelled = false
    api.listLiveChannels(token)
      .then(list => {
        if (cancelled) return
        // Include 'finished' channels too -- a channel stays finished for
        // the entire post-quiz explain walkthrough, and the admin needs a
        // way back in if they reload mid-walkthrough. The channel is only
        // truly gone once they explicitly close it (which removes it from
        // the store entirely, so it won't show up here regardless).
        setChannels(list.filter(c => c.admin_user_id === userId))
      })
      .catch(() => { /* silent — this panel is a convenience, not critical path */ })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [token, userId, refreshTick])

  const rejoin = (ch) => {
    setPending(ch.code)
    onRejoined(ch, passwords[ch.code] || '')
  }

  if (loading || channels.length === 0) return null

  return (
    <div className="glass-panel fade-up max-w-[480px] mb-5 p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-white/40 font-semibold tracking-wide uppercase">
          Rejoin a channel you're already hosting
        </div>
        {link && <CopyButton value={link} label="Copy link" />}
      </div>
      <div className="flex flex-col gap-2.5">
        {channels.map(ch => (
          <div key={ch.code} className="flex flex-col gap-2 px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold text-white/90">{ch.name} <span className="text-white/40 font-normal">· {ch.code}</span></div>
                <div className="text-[0.78rem] text-white/40">{ch.quiz_title} · {ch.participant_count} connected · {ch.state}</div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={pending === ch.code} onClick={() => rejoin(ch)}>
                {pending === ch.code ? <Spinner sm /> : 'Rejoin as host'}
              </button>
            </div>
            {ch.locked && (
              <input
                className="input"
                type="password"
                placeholder="Channel password"
                value={passwords[ch.code] || ''}
                onChange={e => setPasswords(p => ({ ...p, [ch.code]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 1: pick a quiz, name the channel, optionally lock it ──────────────
function CreateChannelForm({ token, toast, onCreated }) {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [quizId, setQuizId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [timePerQuestion, setTimePerQuestion] = useState(20)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.adminQuizzes(token, '?quiz_type=live')
      .then(qs => {
        setQuizzes(qs)
        if (qs.length) setQuizId(String(qs[0].id))
      })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!name.trim()) return toast('Channel name is required', 'error')
    if (!quizId) return toast('Pick a quiz', 'error')
    setCreating(true)
    try {
      const channel = await api.createLiveChannel(token, {
        name,
        quiz_id: Number(quizId),
        password: password || null,
        time_per_question: Number(timePerQuestion) || 20,
      })
      onCreated(channel, password)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <Loading />

  if (quizzes.length === 0) {
    return (
      <div className="text-center py-12 text-white/40">
        <div className="text-3xl mb-3">📡</div>
        You need at least one quiz marked as "Live" type (with questions) before starting a live channel.
        Set a quiz's type to Live from the Manage Quizzes page.
      </div>
    )
  }

  return (
    <div className="glass-panel fade-up max-w-[480px] p-6">
      <div className="flex flex-col gap-4">
        <Select label="Quiz" value={quizId} onChange={setQuizId}
          options={quizzes.map(q => ({ value: String(q.id), label: `${q.title} (${q.question_count ?? 0} questions)` }))} />
        <div className="input-group">
          <label className="input-label">Channel name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Period 3 – Live Round" />
        </div>
        <div className="input-group">
          <label className="input-label">Password (optional)</label>
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank for an open channel" />
        </div>
        <div className="input-group">
          <label className="input-label">Seconds per question</label>
          <input className="input" type="number" min={5} value={timePerQuestion} onChange={e => setTimePerQuestion(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" onClick={create} disabled={creating}>
          {creating ? <Spinner sm /> : 'Create channel & open room'}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: the live room (host view) ───────────────────────────────────────
function ExplainPanel({ q, onPrev, onNext }) {
  const total = q.counts.reduce((a, b) => a + b, 0)
  return (
    <div className="glass-panel fade-up p-6">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-white/40 font-semibold tracking-wide uppercase">
          Review · Question {q.index + 1} of {q.total}
        </div>
      </div>
      <p className="font-semibold mb-3.5">{q.text}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const count = q.counts[i] || 0
          const pct = total ? Math.round((count / total) * 100) : 0
          const isCorrect = i === q.correct_option
          return (
            <div key={i} className={`relative overflow-hidden px-3 py-2 rounded-md flex justify-between gap-2 border ${isCorrect ? 'bg-emerald-400/10 border-emerald-400/40' : 'bg-white/[0.04] border-white/10'}`}>
              <span>{opt}</span>
              <span className="font-head font-bold">{count} · {pct}%</span>
            </div>
          )
        })}
      </div>
      {q.explanation && (
        <div className="mt-3.5 p-3 bg-white/[0.04] border border-white/10 rounded-md text-[0.85rem] text-white/60">
          {q.explanation}
        </div>
      )}
      <div className="flex justify-between mt-5">
        <button className="btn btn-ghost" onClick={onPrev} disabled={q.index === 0}>← Previous</button>
        <button className="btn btn-primary" onClick={onNext} disabled={q.index >= q.total - 1}>Next →</button>
      </div>
    </div>
  )
}

function HostRoom({ socket,link, channel, token,onCopy, toast, onReset }) {
  const {
    users, quizState, question, correctIndex, leaderboard, startQuiz, leave,
    explainQuestion, startExplain, explainNext, explainPrev,
  } = socket
  const [closing, setClosing] = useState(false)


  const doReset = async () => {
    setClosing(true)
    try {
      await api.closeLiveChannel(token, channel.code)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      leave()
      onReset()
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-[640px]">
      <div className="glass-panel fade-up p-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-1">
              Join code
            </div>
            <div className="flex items-center gap-3">
              <span className="font-head font-extrabold text-3xl tracking-[0.1em] text-white">{channel.code}</span>
              <CopyButton value={channel.code} label="Copy code" />
            </div>
            {link && (
              <div className="mt-2.5">
                <CopyButton value={link} label="Copy join link" />
              </div>
            )}
          </div>
          <span className={`badge ${channel.locked ? 'badge-gray' : 'badge-blue'}`}>
            {channel.locked ? '🔒 Password protected' : '🔓 Open'}
          </span>
        </div>
        <div className="text-white/40 text-sm">{channel.quiz_title}</div>
      </div>

      <div className="glass-panel fade-up-1 p-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-xs text-white/40 font-semibold tracking-wide uppercase">
            Connected ({users.length})
          </div>
          {quizState === 'in_progress' && (
            <span className="flex items-center gap-1 text-xs text-accent-300">
              <span className="live-dot" /> LIVE — Q{question ? question.index + 1 : '?'}/{question?.total ?? '?'}
            </span>
          )}
          {quizState === 'finished' && <span className="badge badge-gray">Finished</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          {users.map(u => (
            <div key={u.user_id} className="flex justify-between items-center px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
              <span className="font-medium">
                {u.username} {u.is_admin && <span className="text-accent-300 text-xs"> (host)</span>}
              </span>
              {!u.is_admin && (
                <span className="font-head font-bold text-white/40">{u.score}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {quizState === 'waiting' && (
        <button className="btn btn-primary w-full" onClick={startQuiz} disabled={users.length < 2}>
          {users.length < 2 ? 'Waiting for at least one participant…' : 'Start quiz'}
        </button>
      )}

      {question && quizState === 'in_progress' && (
        <div className="glass-panel fade-up-2 p-6">
          <div className="text-xs text-white/40 mb-2">Current question</div>
          <p className="font-medium mb-3">{question.text}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {question.options.map((opt, i) => (
              <div key={i} className={`px-2.5 py-1.5 rounded-md text-[0.8rem] border ${correctIndex === i ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : 'bg-white/[0.04] border-white/10 text-white/60'}`}>{opt}</div>
            ))}
          </div>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="glass-panel fade-up-3 p-6">
          <div className="text-xs text-white/40 mb-2">Leaderboard</div>
          <ol className="flex flex-col gap-1.5 pl-[1.1rem]">
            {leaderboard.map((s, i) => (
              <li key={s.username} className="flex justify-between">
                <span>{s.username}</span>
                <span className="font-bold">{s.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {quizState === 'finished' && (
        explainQuestion ? (
          <ExplainPanel q={explainQuestion} onPrev={explainPrev} onNext={explainNext} />
        ) : (
          <button className="btn btn-primary w-full" onClick={startExplain}>
            📖 Start explanation walkthrough
          </button>
        )
      )}

      <button className="btn btn-ghost" onClick={doReset} disabled={closing}>
        {closing ? <Spinner sm /> : '← Close this channel & start a new one'}
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminLive() {
  const { token, user } = useAuth()
  const {link,setLink} =useData()
  const toast = useToast()
  const socket = useLiveSocket()
  const [channel, setChannel] = useState(null)
  // Bumped whenever a channel is created/closed so MyChannelsPanel refetches.
  const [refreshTick, setRefreshTick] = useState(0)

  const handleCreated = (created, password) => {
    setChannel(created)
    const link=FRONTEND_BASE+"live/"+created.code+"/"+created.link_token // FRONTEND_BASE always ends in "/" now
    console.log("link is",link)
    setLink(link)
    socket.join(created.code, token, password)
    setRefreshTick(t => t + 1)
  }

  // Reclaiming an existing channel — same join flow as creating one, just
  // sourced from the channel summary instead of the create-channel response.
  const handleRejoined = (summary, password) => {
    setChannel(summary)
   
    socket.join(summary.code, token, password)
  }

  const handleReset = () => {
    setChannel(null)
    setRefreshTick(t => t + 1)

  }

  useEffect(() => {
    if (socket.error) toast(socket.error, 'error')
  }, [socket.error])

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Live Quiz</h1>
        <p className="page-sub">Host a live, synchronized round for an existing quiz</p>
      </div>

      {!channel ? (
        <>
          {user && (
            <MyChannelsPanel
              token={token}
              link={link}
              userId={user.id}
              toast={toast}
              onRejoined={handleRejoined}
              refreshTick={refreshTick}
            />
          )}
          <CreateChannelForm token={token} toast={toast} onCreated={handleCreated} />
        </>
      ) : (
        <HostRoom socket={socket} channel={channel} link={link} token={token} toast={toast} onReset={handleReset} />
      )}
    </div>
  )
}
