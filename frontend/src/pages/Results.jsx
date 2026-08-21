import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { Loading, DiffBadge, EmptyState } from '../components/Shared'

export default function Results() {
  const { myResults } = useData()
  const navigate = useNavigate()

  useEffect(() => { myResults.load() }, [])

  const results   = myResults.data ?? []
  const firstLoad = myResults.data === null && myResults.loading

  if (firstLoad) return <Loading />

  const avgScore = results.length
    ? Math.round(results.reduce((a, r) => a + (r.score / r.total) * 100, 0) / results.length)
    : 0
  const best = results.length
    ? Math.round(Math.max(...results.map(r => (r.score / r.total) * 100)))
    : 0

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">My Results</h1>
        <p className="page-sub">Review your quiz history and scores</p>
      </div>

      {results.length > 0 && (
        <div className="stats-grid fade-up-1">
          <div className="stat-card">
            <div className="stat-label">Total Attempts</div>
            <div className="stat-value">{results.length}</div>
            <div className="stat-sub">Quizzes submitted</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg. Score</div>
            <div className="stat-value">
              {avgScore}<span className="text-base text-white/40">%</span>
            </div>
            <div className="stat-sub">Across all tests</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Best Score</div>
            <div className="stat-value text-accent-400">
              {best}<span className="text-base text-white/40">%</span>
            </div>
            <div className="stat-sub">Personal best</div>
          </div>
        </div>
      )}

      {results.length === 0
        ? <EmptyState icon="🏆" title="No results yet" sub="Take a quiz to see your results here."
            action={<button className="btn btn-primary" onClick={() => navigate('/quizzes')}>Browse Quizzes →</button>}
          />
        : <>
            {/* Mobile: stacked cards (tables don't work well on small screens) */}
            <div className="flex flex-col gap-3 md:hidden fade-up-2">
              {results.map(r => {
                const pct = Math.round((r.score / r.total) * 100)
                const colorCls = pct >= 80 ? 'text-accent-400' : pct >= 60 ? 'text-[#5fdcff]' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'
                return (
                  <div key={r.id} className="glass-panel p-4 flex flex-col gap-2 cursor-pointer" onClick={() => navigate(`/results/${r.id}`)}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-medium text-sm text-white/90 min-w-0 break-words">{r.quiz_title}</div>
                      <span className={`font-head font-bold text-lg shrink-0 ${colorCls}`}>{pct}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <DiffBadge level={r.difficulty} />
                      <span className="text-xs text-white/40">{r.score}/{r.total} · {new Date(r.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop: full table */}
            <div className="card fade-up-2 hidden md:block">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Quiz</th><th>Difficulty</th>
                      <th>Score</th>
                      <th>Pct.</th>
                      <th>Submitted</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => {
                      const pct = Math.round((r.score / r.total) * 100)
                      const colorCls = pct >= 80 ? 'text-accent-400' : pct >= 60 ? 'text-[#5fdcff]' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'
                      return (
                        <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/results/${r.id}`)}>
                          <td className="font-medium">{r.quiz_title}</td>
                          <td><DiffBadge level={r.difficulty} /></td>
                          <td className="font-head font-bold">{r.score}/{r.total}</td>
                          <td><span className={`font-head font-bold ${colorCls}`}>{pct}%</span></td>
                          <td>{new Date(r.submitted_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm"
                              onClick={e => { e.stopPropagation(); navigate(`/results/${r.id}`) }}>
                              Review →
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
      }
    </div>
  )
}
