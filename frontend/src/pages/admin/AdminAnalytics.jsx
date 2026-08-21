import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Loading, Select } from '../../components/Shared'

function Stat({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function Bar({ label, value, color = 'var(--accent)' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="text-white/45">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  )
}

export default function AdminAnalytics() {
  const { token } = useAuth()
  const toast = useToast()
  const [quizzes, setQuizzes] = useState([])
  const [quizId, setQuizId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.adminQuizzes(token).then(setQuizzes).catch(() => setQuizzes([]))
  }, [token])

  const load = async (id) => {
    if (!id) return
    setLoading(true)
    try {
      setData(await api.quizAnalytics(token, id))
    } catch (e) {
      toast(e.message, 'error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Quiz Analytics</h1>
        <p className="page-sub">Test, question, and category performance at a glance</p>
      </div>

      <div className="card mb-5 flex flex-wrap gap-3 items-center">
        <Select value={quizId} onChange={value => { setQuizId(value); load(value) }} className="w-full max-w-xl" placeholder="Select a quiz" options={[{ value: '', label: 'Select a quiz' }, ...quizzes.map(q => ({ value: String(q.id), label: q.title }))]} />
      </div>

      {!data && !loading && (
        <div className="glass-panel p-10 text-center text-white/45">
          Choose a quiz to view analytics.
        </div>
      )}
      {loading && <Loading />}
      {data && !loading && (
        <div className="flex flex-col gap-5">
          <div className="stats-grid">
            <Stat label="Attempts" value={data.test_summary.attempts} sub="Submitted attempts" />
            <Stat label="Average Score" value={`${data.test_summary.average_score}%`} sub="Across all attempts" />
            <Stat label="Highest Score" value={`${data.test_summary.highest_score}%`} sub="Best performance" />
            <Stat label="Lowest Score" value={`${data.test_summary.lowest_score}%`} sub="Needs attention" />
            <Stat label="Pass Rate" value={`${data.test_summary.pass_percentage}%`} sub="Passed attempts" />
            <Stat label="Avg. Time" value={`${Math.round(data.test_summary.average_completion_time / 60)}m`} sub="Completion time" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card">
              <h2 className="font-head font-bold text-lg mb-4">Category Analytics</h2>
              <div className="flex flex-col gap-4">
                {data.category_analytics.length === 0
                  ? <div className="text-white/40 text-sm">No categories yet.</div>
                  : data.category_analytics.map(cat => (
                    <div key={cat.category} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <div className="font-medium text-white/85">{cat.category}</div>
                          <div className="text-xs text-white/40">{cat.questions} questions</div>
                        </div>
                        <div className="text-right">
                          <div className="font-head font-bold text-accent-300">{cat.average_score}%</div>
                          <div className="text-xs text-white/40">Avg. score</div>
                        </div>
                      </div>
                      <Bar label="Correct rate" value={cat.correct_percentage} />
                    </div>
                  ))}
              </div>
            </div>

            <div className="card">
              <h2 className="font-head font-bold text-lg mb-4">Difficult Questions</h2>
              <div className="flex flex-col gap-3">
                {data.difficult_questions.map(q => (
                  <div key={q.question_id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                    <div className="flex justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <div className="font-medium text-white/85 truncate">{q.text}</div>
                        <div className="text-xs text-white/40">{q.category || 'Uncategorized'} · {q.question_type}</div>
                      </div>
                      <div className="font-head font-bold text-rose-300">{q.correct_percentage}%</div>
                    </div>
                    <Bar label="Correct" value={q.correct_percentage} color="var(--accent2)" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs text-white/45">
                      <div>Incorrect {q.incorrect_percentage}%</div>
                      <div>Partial {q.partial_percentage}%</div>
                      <div>Unanswered {q.unanswered_percentage}%</div>
                      <div>Attempts {q.attempts}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-head font-bold text-lg mb-4">Question Analytics</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Attempts</th>
                    <th>Correct</th>
                    <th>Incorrect</th>
                    <th>Partial</th>
                    <th>Unanswered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.question_analytics.map(q => (
                    <tr key={q.question_id}>
                      <td>
                        <div className="font-medium text-white/90">{q.text}</div>
                        <div className="text-xs text-white/40">{q.category || 'Uncategorized'} · {q.question_type}</div>
                      </td>
                      <td>{q.attempts}</td>
                      <td>{q.correct_percentage}%</td>
                      <td>{q.incorrect_percentage}%</td>
                      <td>{q.partial_percentage}%</td>
                      <td>{q.unanswered_percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
