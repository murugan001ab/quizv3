import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Loading, Spinner } from '../../components/Shared'

function formatAnswer(value) {
  if (value === null || value === undefined || value === '') return 'No answer'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function GradeAttempt({ attemptId, token, toast, onBack, onGraded }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [grades, setGrades] = useState({})
  const [feedback, setFeedback] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.gradableAnswers(token, attemptId)
      .then(d => {
        if (cancelled) return
        setData(d)
        const nextGrades = {}
        const nextFeedback = {}
        for (const item of d.items) {
          nextGrades[item.question_id] = item.current_points ?? ''
          nextFeedback[item.question_id] = item.current_feedback ?? ''
        }
        setGrades(nextGrades)
        setFeedback(nextFeedback)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attemptId, token])

  const summary = useMemo(() => {
    if (!data) return null
    const total = data.items.reduce((sum, item) => sum + Number(item.points || 0), 0)
    return {
      total,
      editable: data.items.filter(item => item.question_type === 'essay').length,
      auto: data.items.filter(item => item.question_type !== 'essay').length,
    }
  }, [data])

  const submit = async () => {
    const items = data.items.filter(item => item.question_type === 'essay')
    const gradesToSave = []
    for (const item of items) {
      const raw = grades[item.question_id]
      if (raw === '' || raw === null || raw === undefined) {
        toast(`Enter a score for Q${item.question_id} before saving`, 'error')
        return
      }
      const val = Number(raw)
      if (Number.isNaN(val) || val < 0 || val > item.points) {
        toast(`Score for Q${item.question_id} must be between 0 and ${item.points}`, 'error')
        return
      }
      gradesToSave.push({
        question_id: item.question_id,
        points: val,
        feedback: feedback[item.question_id] || null,
      })
    }

    setSaving(true)
    try {
      await api.gradeAttempt(token, attemptId, gradesToSave)
      toast('Grades saved!', 'success')
      onGraded()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />
  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
        {error || 'Attempt not found.'}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to queue</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.25rem' }}>{data.quiz_title}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '0.2rem' }}>
              {data.student || 'Unknown student'} · {data.status === 'grading_pending' ? 'Grading Pending' : data.status}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {data.items.map((item, index) => (
            <div key={item.question_id} className="card fade-up" style={{ animationDelay: `${index * 0.02}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Q{index + 1} · {item.question_type.replaceAll('_', ' ')}
                  </div>
                  <div style={{ fontWeight: 500, marginTop: '0.35rem', lineHeight: 1.6 }}>{item.text}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="badge badge-gray">Max {item.points}</div>
                  {item.is_auto_graded && <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text3)' }}>Auto-graded</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student answer</div>
                  <div style={{ padding: '0.8rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {formatAnswer(item.student_answer)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correct answer</div>
                    <div style={{ padding: '0.8rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {item.correct_answer === null || item.correct_answer === undefined || item.question_type === 'essay'
                        ? 'Teacher review required'
                        : formatAnswer(item.correct_answer)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Awarded points</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={item.points}
                      step="0.5"
                      disabled={item.question_type !== 'essay'}
                      value={grades[item.question_id]}
                      onChange={e => setGrades(prev => ({ ...prev, [item.question_id]: e.target.value }))}
                      placeholder={item.question_type === 'essay' ? `0 - ${item.points}` : 'Auto-calculated'}
                    />
                    {item.question_type === 'essay' && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text3)' }}>
                        Enter any value from 0 to {item.points}.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feedback</div>
                  <input
                    className="input"
                    value={feedback[item.question_id] || ''}
                    onChange={e => setFeedback(prev => ({ ...prev, [item.question_id]: e.target.value }))}
                    placeholder="Teacher comments for the student"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card xl:sticky xl:top-6 h-fit">
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Grading Summary</div>
        <div style={{ display: 'grid', gap: '0.8rem', fontSize: '0.9rem' }}>
          <div><span style={{ color: 'var(--text3)' }}>Questions:</span> {data.items.length}</div>
          <div><span style={{ color: 'var(--text3)' }}>Auto-graded:</span> {summary?.auto ?? 0}</div>
          <div><span style={{ color: 'var(--text3)' }}>Essay questions:</span> {summary?.editable ?? 0}</div>
          <div><span style={{ color: 'var(--text3)' }}>Maximum points:</span> {summary?.total ?? 0}</div>
          <div><span style={{ color: 'var(--text3)' }}>Status:</span> <span className="badge badge-blue">{data.status === 'grading_pending' ? 'Grading Pending' : data.status}</span></div>
        </div>

        <div className="divider" />

        <button className="btn btn-primary w-full" onClick={submit} disabled={saving || summary?.editable === 0}>
          {saving ? <Spinner sm /> : 'Save Grades'}
        </button>
        <button className="btn btn-ghost w-full mt-3" onClick={onBack} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}

export default function AdminGrading() {
  const { token } = useAuth()
  const toast = useToast()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.gradingQueue(token)
      setQueue(data)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (activeId) {
    return (
      <div className="page-wrap">
        <GradeAttempt
          attemptId={activeId}
          token={token}
          toast={toast}
          onBack={() => setActiveId(null)}
          onGraded={() => { setActiveId(null); load() }}
        />
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Grading Queue</h1>
        <p className="page-sub">Open attempts, review every answer, and save manual scores</p>
      </div>

      {loading ? <Loading /> : queue.length === 0
        ? <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text3)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <div style={{ fontSize: '1.1rem', color: 'var(--text2)', marginBottom: '0.5rem' }}>All caught up</div>
            <div style={{ fontSize: '0.875rem' }}>Nothing is currently awaiting manual grading.</div>
          </div>
        : <div className="card fade-up-2" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Student</th><th>Quiz</th><th>Submitted</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {queue.map((a, i) => (
                    <tr key={a.id} className="fade-up" style={{ animationDelay: `${i * 0.03}s` }}>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {a.user?.username || a.guest_name || '—'}
                        {!a.user && a.guest_name ? <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--text3)' }}>guest</span> : null}
                      </td>
                      <td>{a.quiz_title || 'Unknown quiz'}</td>
                      <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                      <td><span className="badge badge-blue">{a.status === 'grading_pending' ? 'Grading Pending' : a.status}</span></td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => setActiveId(a.id)}>Open →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      }
    </div>
  )
}
