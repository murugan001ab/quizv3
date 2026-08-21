import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { Loading, QuizCard, EmptyState } from '../components/Shared'

export default function UserDashboard() {
  const { user } = useAuth()
  const { userQuizzes, myResults } = useData()
  const navigate = useNavigate()

  // Trigger loads — returns cached data instantly if fresh, fetches in background if stale
  useEffect(() => {
    userQuizzes.load()
    myResults.load()
  }, [])

  const quizzes = userQuizzes.data ?? []
  const results  = myResults.data  ?? []
  const loading  = (userQuizzes.data === null && userQuizzes.loading) ||
                   (myResults.data  === null && myResults.loading)

  if (loading) return <Loading />

  const completed = results.length
  const avgScore  = results.length
    ? Math.round(results.reduce((a, r) => a + (r.score / r.total) * 100, 0) / results.length)
    : 0

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Hey, {user?.username} 👋</h1>
        <p className="page-sub">Ready to test your knowledge today?</p>
      </div>

      <div className="stats-grid fade-up-1">
        <div className="stat-card">
          <div className="stat-label">Available Quizzes</div>
          <div className="stat-value">{quizzes.length}</div>
          <div className="stat-sub">Ready to take</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value">{completed}</div>
          <div className="stat-sub">Tests submitted</div>
        </div>
        {/* <div className="stat-card">
          <div className="stat-label">Avg. Score</div>
          <div className="stat-value">
            {avgScore}<span className="text-base text-white/40">%</span>
          </div>
          <div className="stat-sub">Across all tests</div>
        </div> */}
      </div>

      <div className="fade-up-2">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-head font-bold text-lg text-white/90">Available Tests</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/quizzes')}>View All →</button>
        </div>
        {quizzes.length === 0
          ? <EmptyState icon="📭" title="No quizzes yet" sub="Check back later when tests are added." />
          : <div className="quiz-grid">
              {quizzes.slice(0, 6).map(q => (
                <QuizCard key={q.id} quiz={q}
                  onClick={() => navigate(`/quiz/${q.id}`)}
                  actions={
                    <button className="btn btn-primary btn-sm"
                      onClick={e => { e.stopPropagation(); navigate(`/quiz/${q.id}`) }}>
                      Take Test →
                    </button>
                  }
                />
              ))}
            </div>
        }
      </div>
    </div>
  )
}
