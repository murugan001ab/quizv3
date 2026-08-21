import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useToast } from '../context/ToastContext'
import { Loading, DiffBadge, Spinner } from '../components/Shared'
import QuestionText from '../components/QuestionText'
import { AnswerInput, isAnswered } from '../components/QuestionAnswer'

// Standalone page — no auth, no sidebar/shell. Anyone with the public link
// lands here directly (see App.jsx: /public/:slug is outside the auth wall).
export default function PublicTakeQuiz() {
  const { slug } = useParams()
  const toast = useToast()

  const [quiz, setQuiz]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // gate → taking → result
  const [stage, setStage]         = useState('gate')
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [starting, setStarting]   = useState(false)

  const [attempt, setAttempt]     = useState(null)   // PublicAttemptOut (has attempt_token)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers]     = useState({})
  const [current, setCurrent]     = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]       = useState(null)

  useEffect(() => {
    api.publicQuiz(slug)
      .then(setQuiz)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  const startAttempt = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast('Please enter your name', 'error')
      return
    }
    setStarting(true)
    try {
      const a = await api.publicStart(slug, { name: name.trim(), email: email.trim() || undefined })
      const ordered = a.questions || []
      setQuestions(ordered)
      setAttempt(a)
      setStage('taking')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setStarting(false)
    }
  }

  const select = (q, value) => {
    setAnswers(prev => ({ ...prev, [q.id]: value }))
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await api.publicSubmit(attempt.attempt_token, attempt.id, answers)
      setResult(r)
      setStage('result')
      toast('Quiz submitted! 🎉', 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Loading />

  if (error || !quiz) {
    return (
      <div className="page-wrap max-w-[520px] mx-auto pt-16">
        <div className="glass-panel text-center p-12">
          <div className="text-3xl mb-4">🔒</div>
          <h2 className="font-head font-bold mb-2">Link unavailable</h2>
          <p className="text-white/40">{error || 'This quiz link could not be found.'}</p>
        </div>
      </div>
    )
  }

  // ── name/email gate ────────────────────────────────────────────────────
  if (stage === 'gate') {
    return (
      <div className="page-wrap max-w-[520px] mx-auto pt-16">
        <div className="glass-panel fade-up p-8">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <DiffBadge level={quiz.difficulty} />
            <span className="tag">{quiz.subject}</span>
          </div>
          <h1 className="font-head font-extrabold text-xl mt-2 mb-2">{quiz.title}</h1>
          {quiz.description && <p className="text-sm text-white/50 mb-3">{quiz.description}</p>}
          {quiz.instructions && (
            <div className="p-3 bg-white/[0.04] rounded-xl text-[0.85rem] text-white/60 border-l-[3px] border-accent-400 leading-relaxed mb-4">
              {quiz.instructions}
            </div>
          )}
          <p className="text-xs text-white/40 mb-6">📝 {quiz.questions?.length ?? quiz.question_count} questions · No account needed</p>

          <form onSubmit={startAttempt} className="flex flex-col gap-3">
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <input
              className="input"
              placeholder="Email (optional)"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button className="btn btn-primary w-full" disabled={starting}>
              {starting ? <Spinner sm /> : 'Start Quiz →'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── result ──────────────────────────────────────────────────────────────
  if (stage === 'result' && result) {
    const pct = result.percentage ?? (result.total > 0 ? Math.round((result.score / result.total) * 100) : 0)
    return (
      <div className="page-wrap max-w-[520px] mx-auto pt-16">
        <div className="glass-panel fade-up text-center p-10">
          <div className="text-4xl mb-3">{pct >= 60 ? '🏆' : '📚'}</div>
          <div className="font-head text-2xl font-extrabold mb-4 text-accent-300">{pct}%</div>
          <div className="text-white/60">
            You scored <b className="text-white/90">{result.score}</b> out of <b className="text-white/90">{result.total}</b>
          </div>
          {result.passed !== null && (
            <div className={`mt-3 font-semibold ${result.passed ? 'text-emerald-300' : 'text-rose-400'}`}>
              {result.passed ? '✓ Passed' : '✗ Did not pass'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── taking the quiz ────────────────────────────────────────────────────
  const q = questions[current]
  const answered = questions.filter(qq => isAnswered(qq, answers[qq.id])).length
  const total = questions.length

  return (
    <div className="page-wrap max-w-[860px] mx-auto pt-8">
      <div className="flex flex-wrap justify-between items-start gap-3 fade-up mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1 mb-1 flex-wrap">
            <DiffBadge level={quiz.difficulty} />
            <span className="tag">{quiz.subject}</span>
          </div>
          <h1 className="font-head font-extrabold text-[1.15rem] sm:text-[1.4rem] break-words">{quiz.title}</h1>
        </div>
      </div>

      <div className="fade-up-1 mb-6">
        <div className="flex justify-between items-center mb-2 text-[0.8rem] text-white/40">
          <span>Question {current + 1} of {total}</span>
          <span>{answered}/{total} answered</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-6 items-start">
        <div className="fade-up-2">
          <div className="glass-panel p-6 mb-4">
            <div className="text-xs text-white/40 mb-3.5 font-semibold tracking-wide uppercase">Q{current + 1}</div>
            <QuestionText text={q.text} />
          </div>

          <div className="flex flex-col gap-2.5">
            <AnswerInput q={q} value={answers[q.id]} onChange={val => select(q, val)} />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              className="btn btn-ghost flex-1 sm:flex-initial"
              onClick={() => setCurrent(c => c - 1)}
              disabled={current === 0}
            >← Previous</button>
            {current < total - 1
              ? <button className="btn btn-primary flex-1 sm:flex-initial" onClick={() => setCurrent(c => c + 1)}>Next →</button>
              : <button className="btn btn-primary flex-1 sm:flex-initial" onClick={submit} disabled={submitting}>
                  {submitting ? <Spinner sm /> : '✓ Submit Quiz'}
                </button>
            }
          </div>
        </div>

        <div className="glass-panel fade-up-3 p-6 md:sticky md:top-6">
          <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-3">Questions</div>
          <div className="q-nav mb-4">
            {questions.map((qq, i) => (
              <div
                key={i}
                className={`q-dot ${i === current ? 'current' : isAnswered(qq, answers[qq.id]) ? 'answered' : ''}`}
                onClick={() => setCurrent(i)}
              >{i + 1}</div>
            ))}
          </div>
          <div className="divider" />
          <button className="btn btn-primary w-full" onClick={submit} disabled={submitting}>
            {submitting ? <Spinner sm /> : `Submit (${answered}/${total})`}
          </button>
        </div>
      </div>
    </div>
  )
}
