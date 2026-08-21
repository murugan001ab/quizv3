import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Loading } from '../components/Shared'
import QuestionText from '../components/QuestionText'
import { AnswerReview, gradeStatus } from '../components/QuestionAnswer'

const STATUS_LABEL = {
  correct: '✓ Correct',
  wrong: '✗ Wrong',
  skipped: '— Skipped',
  pending: '⏳ Pending review',
}
const STATUS_CLASS = {
  correct: 'text-accent-400',
  wrong: 'text-rose-400',
  skipped: 'text-white/40',
  pending: 'text-amber-400',
}

export default function Result() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    api.resultDetail(token, id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading />

  if (error || !data) return (
    <div className="page-wrap">
      <div className="glass-panel text-center p-12">
        <div className="text-3xl mb-4">❌</div>
        <h2 className="font-head font-bold mb-2">Result not found</h2>
        <p className="text-white/40 mb-6">{error}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/results')}>← Back to Results</button>
      </div>
    </div>
  )

  // Normalise string keys → number keys
  const answers = {}
  for (const [k, v] of Object.entries(data.answers || {})) {
    answers[Number(k)] = v
  }

  const pct = data.total > 0 ? Math.round((data.score / data.total) * 100) : 0
  const grade = pct >= 80 ? { label: 'Excellent!', color: '#5fdcff',  emoji: '🏆' }
    : pct >= 60          ? { label: 'Good Job!',   color: '#5fdcff',    emoji: '👍' }
    : pct >= 40          ? { label: 'Keep Trying',  color: '#fbbf24', emoji: '💪' }
    :                      { label: 'Needs Work',   color: '#f87171',    emoji: '📚' }

  return (
    <div className="page-wrap max-w-[760px]">

      {/* ── Score hero ── */}
      <div className="glass-panel fade-up text-center p-6 sm:p-10 mb-8">
        <div className="text-4xl mb-2">{grade.emoji}</div>
        <div className="font-head text-2xl font-extrabold mb-1" style={{ color: grade.color }}>
          {grade.label}
        </div>
        <div className="flex justify-center my-6">
          <div className="score-ring" style={{ borderColor: grade.color, boxShadow: `0 0 30px ${grade.color}40` }}>
            <div className="score-num" style={{ color: grade.color }}>{pct}%</div>
            <div className="score-label">score</div>
          </div>
        </div>
        <div className="text-white/60 text-base">
          You scored <b className="text-white/90">{data.score}</b> out of <b className="text-white/90">{data.total}</b> questions
        </div>
        <div className="mt-2 text-[0.8rem] text-white/40">
          Submitted: {new Date(data.submitted_at).toLocaleString()}
        </div>
      </div>

      {/* ── Question review ── */}
      <div className="fade-up-1 mb-4">
        <h2 className="font-head font-bold mb-4">Question Review</h2>
        <div className="flex flex-col gap-4">
          {data.questions.map((q, i) => {
            const chosen = answers[q.id]
            const status = gradeStatus(q, chosen)

            return (
              <div key={q.id} className="glass-panel p-6">
                {/* Header row */}
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[0.8rem] text-white/40 font-semibold">Q{i + 1}</span>
                    {q.year && (
                      <span className="text-[0.68rem] font-semibold px-1.5 py-0.5 rounded bg-accent-400/10 text-accent-400">{q.year}</span>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                {/* ✅ Structured question renderer */}
                <div className="mb-3.5">
                  <QuestionText text={q.text} />
                </div>

                {/* Answer review — type-aware */}
                <AnswerReview q={q} given={chosen} />

                {/* Explanation */}
                {q.explanation && (
                  <div className="mt-3.5 p-3 bg-white/[0.04] rounded-xl text-[0.85rem] text-white/60 border-l-[3px] border-accent-400 leading-relaxed">
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-col sm:flex-row gap-2 fade-up-2 mt-6">
        <button className="btn btn-ghost"   onClick={() => navigate('/results')}>← All Results</button>
        <button className="btn btn-primary" onClick={() => navigate('/quizzes')}>Take Another Quiz</button>
      </div>
    </div>
  )
}
