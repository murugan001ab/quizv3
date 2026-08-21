import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { Loading, QuizCard, EmptyState, Select } from '../components/Shared'

const SUBJECTS = ['All', 'Tamil', 'Science', 'Physics', 'Maths', 'Biology', 'Chemistry', 'History', 'English']
const DIFFS    = ['All', 'easy', 'medium', 'hard']

export default function Quizzes() {
  const { userQuizzes } = useData()
  const navigate = useNavigate()
  const [subject, setSubject] = useState('All')
  const [diff,    setDiff]    = useState('All')

  // Load once — cache handles dedup
  useEffect(() => { userQuizzes.load() }, [])

  // Filter client-side — no extra API calls on filter change
  const filtered = useMemo(() => {
    const all = userQuizzes.data ?? []
    return all.filter(q =>
      (subject === 'All' || q.subject === subject) &&
      (diff    === 'All' || q.difficulty === diff)
    )
  }, [userQuizzes.data, subject, diff])

  const firstLoad = userQuizzes.data === null && userQuizzes.loading

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Browse Quizzes</h1>
        <p className="page-sub">Filter by subject or difficulty</p>
      </div>

      <div className="flex gap-3 flex-wrap fade-up-1">
        <Select label="Subject" value={subject} onChange={setSubject} className="min-w-[170px]" options={SUBJECTS.map(value => ({ value, label: value }))} />
        <Select label="Difficulty" value={diff} onChange={setDiff} className="min-w-[170px]" options={DIFFS.map(value => ({ value, label: value === 'All' ? value : value[0].toUpperCase() + value.slice(1) }))} />
      </div>

      {firstLoad ? <Loading /> : filtered.length === 0
        ? <EmptyState icon="🔍" title="No quizzes found" sub="Try a different filter." />
        : <div className="quiz-grid fade-up-2">
            {filtered.map(q => (
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
  )
}
