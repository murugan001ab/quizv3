import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Loading, DiffBadge, SubjectTag } from '../components/Shared'
import QuestionText from '../components/QuestionText'

function InfoTile({ icon, label, value }) {
  return (
    <div className="glass-panel p-4 flex flex-col gap-1">
      <div className="text-xs text-white/40 flex items-center gap-1.5">{icon} {label}</div>
      <div className="font-head font-bold text-lg text-white/90">{value}</div>
    </div>
  )
}

export default function TestInstructions() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.testInstructions(token, id)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, token])

  if (loading) return <Loading />

  if (error || !data) return (
    <div className="page-wrap">
      <div className="glass-panel text-center p-12">
        <div className="text-3xl mb-4">🔒</div>
        <h2 className="font-head font-bold mb-2">Test Unavailable</h2>
        <p className="text-white/40 mb-6">{error || 'This test could not be found.'}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/quizzes')}>← Back to Tests</button>
      </div>
    </div>
  )

  const startLabel = data.has_in_progress_attempt ? '▶ Resume Test' : '▶ Start Test'

  return (
    <div className="page-wrap max-w-[760px]">
      <div className="page-header fade-up">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <DiffBadge level={data.difficulty} />
          <SubjectTag subject={data.subject} />
          <SubjectTag subject={data.topic} />
        </div>
        <h1 className="page-title">{data.title}</h1>
        {data.description && <p className="page-sub">{data.description}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up-1">
        <InfoTile icon="📝" label="Questions" value={data.question_count} />
        <InfoTile icon="⏱" label="Duration" value={data.duration_minutes ? `${data.duration_minutes} min` : 'No limit'} />
        <InfoTile icon="🎯" label="Passing" value={`${data.passing_percentage}%`} />
        <InfoTile
          icon="🔁"
          label="Attempts left"
          value={data.has_in_progress_attempt ? 'In progress' : `${data.attempts_remaining}/${data.max_attempts}`}
        />
      </div>

      {data.instructions && (
        <div className="glass-panel p-6 fade-up-2">
          <h2 className="font-head font-bold text-sm text-white/70 mb-3 uppercase tracking-wide">📋 Instructions</h2>
          <div className="text-sm text-white/70 leading-relaxed">
            <QuestionText text={data.instructions} />
          </div>
        </div>
      )}

      <div className="glass-panel p-6 fade-up-2">
        <h2 className="font-head font-bold text-sm text-white/70 mb-3 uppercase tracking-wide">ℹ️ Before you begin</h2>
        <ul className="text-sm text-white/60 leading-relaxed list-disc pl-5 flex flex-col gap-1.5">
          <li>Your answers are saved automatically as you go — a refresh won't lose your progress.</li>
          {data.duration_minutes && <li>The timer is enforced by the server. It keeps running even if you close the tab.</li>}
          {data.allow_bookmarking && <li>You can bookmark questions to revisit before submitting.</li>}
          {!data.allow_navigation && <li>You won't be able to go back to a previous question once you move on.</li>}
          {data.random_question_count ? <li>This test will randomly select {data.random_question_count} question(s) from the bank for your attempt.</li> : null}
          {data.randomize_questions ? <li>Question order will be randomized for this attempt.</li> : null}
          {data.randomize_answers ? <li>Answer option order may be randomized for eligible questions.</li> : null}
          <li>{data.allow_retakes ? `You may attempt this test up to ${data.max_attempts} time(s).` : 'This test can only be attempted once.'}</li>
        </ul>
      </div>

      {data.block_reason && !data.has_in_progress_attempt && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-400/25 text-rose-300 text-sm px-4 py-3 fade-up-2">
          ⚠️ {data.block_reason}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 fade-up-3">
        <button className="btn btn-ghost" onClick={() => navigate('/quizzes')}>← Back</button>
        <button
          className="btn btn-primary flex-1"
          disabled={!data.can_start && !data.has_in_progress_attempt}
          onClick={() => navigate(`/quiz/${id}/take`)}
        >
          {startLabel}
        </button>
      </div>
    </div>
  )
}
