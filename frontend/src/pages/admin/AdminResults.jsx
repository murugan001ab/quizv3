import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Loading, Spinner, Select } from '../../components/Shared'
import QuestionText from '../../components/QuestionText'
import { AnswerReview } from '../../components/QuestionAnswer'

export default function AdminResults() {
  const { token } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [q, setQ] = useState({ search: '', status: '', sort_by: 'date', sort_order: 'desc', page: 1, limit: 20 })

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', q.limit)
      params.set('offset', (q.page - 1) * q.limit)
      if (q.search) params.set('search', q.search)
      if (q.status) params.set('status', q.status)
      params.set('sort_by', q.sort_by)
      params.set('sort_order', q.sort_order)
      setRows(await api.adminAttempts(token, `?${params.toString()}`))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [q.page, q.limit, q.sort_by, q.sort_order])

  const openDetail = async (id) => {
    setDetail(null)
    setActivity([])
    try {
      setDetail(await api.adminAttemptResult(token, id))
      setActivityLoading(true)
      setActivity(await api.adminAttemptActivity(token, id))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setActivityLoading(false)
    }
  }

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams()
      if (q.search) params.set('search', q.search)
      if (q.status) params.set('status', q.status)
      params.set('sort_by', q.sort_by)
      params.set('sort_order', q.sort_order)
      const blob = await api.exportAttempts(token, `?${params.toString()}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'results-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (detail) {
    return (
      <div className="page-wrap">
        <button className="btn btn-ghost btn-sm mb-4" onClick={() => setDetail(null)}>← Back</button>
        <div className="card">
          <h2 className="font-head text-xl font-bold mb-2">{detail.quiz_title}</h2>
          <div className="text-sm text-white/50 mb-6">{detail.student || 'Unknown student'} · {detail.status}</div>
          <div className="grid gap-4">
            {detail.questions.map((question, idx) => (
              <div key={question.id} className="glass-panel p-4">
                <div className="mb-2 text-xs text-white/40">Q{idx + 1} · {question.question_type}</div>
                <QuestionText text={question.text} />
                <div className="mt-3"><AnswerReview q={question} given={JSON.parse(JSON.stringify(detail.answers?.[question.id] ?? detail.answers?.[String(question.id)]))} /></div>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <h3 className="font-head text-lg font-semibold mb-3">Activity timeline</h3>
            {activityLoading ? (
              <Loading />
            ) : activity.length === 0 ? (
              <div className="text-sm text-white/40">No activity recorded.</div>
            ) : (
              <div className="grid gap-2">
                {activity.map(ev => (
                  <div key={ev.id} className="glass-panel p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{ev.event_type.replaceAll('_', ' ')}</div>
                      <div className="text-xs text-white/40">{new Date(ev.created_at).toLocaleString()}</div>
                    </div>
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <pre className="mt-2 text-xs text-white/45 whitespace-pre-wrap break-words">{JSON.stringify(ev.metadata, null, 2)}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Results</h1>
        <p className="page-sub">Search, sort, and review all submitted attempts</p>
      </div>
      <div className="card mb-4 flex flex-wrap gap-3">
        <input className="input" placeholder="Search student or test" value={q.search} onChange={e => setQ(prev => ({ ...prev, search: e.target.value }))} />
        <Select value={q.status} onChange={value => setQ(prev => ({ ...prev, status: value }))} className="min-w-[160px]" options={[{ value: '', label: 'All status' }, { value: 'submitted', label: 'Submitted' }, { value: 'graded', label: 'Graded' }, { value: 'grading_pending', label: 'Grading Pending' }]} />
        <Select value={q.sort_by} onChange={value => setQ(prev => ({ ...prev, sort_by: value }))} className="min-w-[145px]" options={['date', 'name', 'score', 'percentage', 'duration', 'status'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
        <button className="btn btn-ghost" onClick={() => setQ(prev => ({ ...prev, sort_order: prev.sort_order === 'asc' ? 'desc' : 'asc' }))}>Sort {q.sort_order}</button>
        <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
        <button className="btn btn-primary" onClick={load}>{loading ? <Spinner sm /> : 'Refresh'}</button>
      </div>
      {loading ? <Loading /> : <div className="card p-0 table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Test</th><th>Attempt</th><th>Score</th><th>%</th><th>Pass</th><th>Duration</th><th>Started</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
              <td>{r.user?.username || r.guest_name || '—'}</td>
              <td>{r.quiz_title || '—'}</td><td>{r.attempt_number}</td><td>{r.obtained_points ?? r.score}/{r.max_points ?? r.total_points ?? r.total}</td><td>{Math.round(r.percentage || 0)}%</td><td>{r.passed == null ? '—' : r.passed ? 'Pass' : 'Fail'}</td><td>{Math.round((r.time_spent_seconds || 0)/60)}m</td><td>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td><td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td><td>{r.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
    </div>
  )
}
