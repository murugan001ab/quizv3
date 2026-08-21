import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Loading, DiffBadge, Modal, Spinner, CopyButton, Select } from '../../components/Shared'
import QuestionEditor, { questionTypeLabel } from '../../components/QuestionEditor'

// Falls back to the current origin when VITE_URL isn't set.
const FRONTEND_BASE = (import.meta.env.VITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/*$/, '/')

const DIFFS = ['easy', 'medium', 'hard']
const SUBJECTS = ['Python', 'JAVA', 'C', 'C++', 'AI/ML', 'Genral', 'Programing']
const KEYS = ['A', 'B', 'C', 'D']
const QUIZ_TYPES = ['scheduled', 'live']
const emptyQuiz = {
  title: '',
  description: '',
  subject: 'Python',
  topic: '',
  difficulty: 'medium',
  quiz_type: 'scheduled',
  scheduled_start: '',
  scheduled_end: '',
  randomize_questions: false,
  randomize_answers: false,
  random_question_count: '',
  random_question_categories: '',
  allow_navigation: true,
  allow_bookmarking: true,
  allow_question_review: true,
  show_results: true,
  show_answers: false,
}

// ── Attempts modal ───────────────────────────────────────────────────────────
function AttemptsModal({ quizId, quizTitle, token, onClose }) {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.quizAttempts(token, quizId).then(setAttempts).catch(() => setAttempts([])).finally(() => setLoading(false))
  }, [quizId])

  return (
    <Modal title={`Attempts — ${quizTitle}`} onClose={onClose}>
      {loading ? <Loading /> : attempts.length === 0
        ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No attempts yet.</div>
        : <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Score</th><th>%</th><th>Submitted</th></tr></thead>
            <tbody>
              {attempts.map(a => {
                const pct = a.total ? Math.round((a.score / a.total) * 100) : null
                const color = pct == null ? 'var(--text3)' : pct >= 80 ? 'var(--accent)' : pct >= 60 ? 'var(--blue)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)'
                return (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--text)', fontWeight: 500 }}>{a.user?.username || a.guest_name || '—'}{!a.user && a.guest_name ? <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--text3)' }}>guest</span> : null}</td>
                    <td>{a.submitted_at ? `${a.score}/${a.total}` : <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>In progress</span>}</td>
                    <td>{pct != null && a.submitted_at ? <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color }}>{pct}%</span> : '—'}</td>
                    <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      }
    </Modal>
  )
}

// ── Question editor modal ────────────────────────────────────────────────────
// Thin wrapper around the shared, extensible QuestionEditor (see
// src/components/QuestionEditor.jsx) — handles all 6 question types.
function QuestionModal({ quizId, editQ, token, toast, onClose, onSaved, categories }) {
  const submit = async (payload) => {
    if (editQ) await api.updateQuestion(token, editQ.id, payload)
    else await api.addQuestion(token, quizId, payload)
    toast(editQ ? 'Question updated!' : 'Question added!', 'success')
    onSaved()
  }

  return (
    <Modal title={editQ ? 'Edit Question' : 'Add Question'} onClose={onClose} size="wide">
      <QuestionEditor
        initial={editQ}
        onSubmit={submit}
        onCancel={onClose}
        toast={toast}
        categories={categories}
      />
    </Modal>
  )
}

// ── Question card body — renders each question type appropriately ──────────
function QuestionSummary({ q }) {
  const type = q.question_type || 'multiple_choice'

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
        {q.options.map((opt, j) => (
          <div key={j} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.375rem 0.625rem',
            background: q.correct_option === j ? 'rgba(52,211,153,0.1)' : 'var(--bg3)',
            border: `1px solid ${q.correct_option === j ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
            borderRadius: 6, fontSize: '0.8rem',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              background: q.correct_option === j ? 'var(--accent2)' : 'var(--card2)',
              color: q.correct_option === j ? '#0a0a0f' : 'var(--text3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-head)',
            }}>{KEYS[j] || j + 1}</span>
            <span style={{ color: q.correct_option === j ? 'var(--accent2)' : 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'multiple_select') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
        {q.options.map((opt, j) => {
          const correct = (q.correct_options || []).includes(j)
          return (
            <div key={j} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.375rem 0.625rem',
              background: correct ? 'rgba(52,211,153,0.1)' : 'var(--bg3)',
              border: `1px solid ${correct ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
              borderRadius: 6, fontSize: '0.8rem',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                background: correct ? 'var(--accent2)' : 'var(--card2)',
                color: correct ? '#0a0a0f' : 'var(--text3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-head)',
              }}>{correct ? '✓' : ''}</span>
              <span style={{ color: correct ? 'var(--accent2)' : 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
            </div>
          )
        })}
        {q.partial_scoring && (
          <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text3)' }}>Partial credit enabled</div>
        )}
      </div>
    )
  }

  if (type === 'short_answer') {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
        <div style={{ marginBottom: '0.25rem', color: 'var(--text3)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accepted answers</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {(q.expected_answers || []).map((a, j) => (
            <span key={j} style={{ padding: '0.25rem 0.625rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, fontSize: '0.78rem' }}>{a}</span>
          ))}
        </div>
        {q.case_sensitive && <div style={{ marginTop: '0.375rem', fontSize: '0.72rem', color: 'var(--text3)' }}>Case-sensitive</div>}
      </div>
    )
  }

  if (type === 'essay') {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text3)', fontStyle: 'italic' }}>
        Free-text response — graded manually.
      </div>
    )
  }

  if (type === 'matching') {
    const { left = [], right = [], correct_mapping = {} } = q.matching_data || {}
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {left.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text2)' }}>{item}</span>
            <span style={{ color: 'var(--text3)' }}>→</span>
            <span style={{ color: 'var(--accent2)' }}>{right[correct_mapping[i]] ?? '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  return null
}

// ── Quiz detail / question manager ───────────────────────────────────────────
function QuizDetail({ quiz, token, toast, onBack, onUpdated }) {
  const [questions, setQuestions] = useState(quiz.questions || [])
  const [showAddQ, setShowAddQ] = useState(false)
  const [editQ, setEditQ] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState([])
  const reload = async () => {
    try {
      const q = await api.adminQuiz(token, quiz.id)
      setQuestions(q.questions || [])
      console.log(q)
    }
    catch (e) {
      toast(e.message, 'error')
    }
  }

  const deleteQ = async (qId) => {
    setDeleting(qId)
    try { await api.deleteQuestion(token, qId); toast('Question deleted', 'success'); setQuestions(qs => qs.filter(q => q.id !== qId)) }
    catch (e) { toast(e.message, 'error') }
    finally { setDeleting(null) }
  }

  const importCsv = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const res = await api.importQuestionsCsv(token, quiz.id, file)
      if (res.errors?.length) {
        setImportErrors(res.errors)
        const first = res.errors[0]
        toast(`Import blocked. Row ${first.row}: ${first.error}`, 'error')
      } else {
        setImportErrors([])
        toast(`Imported ${res.inserted} questions`, 'success')
        await reload()
        onUpdated()
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  // Known categories across this quiz's questions, offered as autocomplete
  // in the editor rather than forcing free-text guesses each time.
  const categories = [...new Set(questions.map(q => q.category).filter(Boolean))]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.25rem' }}>{quiz.title}</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '0.2rem' }}>{questions.length} question{questions.length !== 1 ? 's' : ''}</div>
        </div>
        <label className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
          {importing ? 'Importing…' : 'Import CSV'}
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => importCsv(e.target.files?.[0])}
          />
        </label>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddQ(true)}>+ Add Question</button>
      </div>

      {importErrors.length > 0 && (
        <div className="card mb-4" style={{ borderColor: 'rgba(248,113,113,0.35)' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Import errors</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text2)' }}>
            {importErrors.map((err, i) => (
              <div key={i} style={{ fontSize: '0.85rem' }}>
                Row {err.row}: {err.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0
        ? <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📝</div>
          No questions yet — add the first one!
        </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {questions.map((q, i) => (
            <div key={q.id} className="card fade-up" style={{ animationDelay: `${i * 0.03}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Q{i + 1}</span>
                    <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>{questionTypeLabel(q.question_type)}</span>
                    {q.category && <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>{q.category}</span>}
                    {q.difficulty && <DiffBadge level={q.difficulty} />}
                    <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{q.points} pt{q.points === 1 ? '' : 's'}</span>
                    {q.is_active === false && <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>Inactive</span>}
                  </div>
                  <p style={{ fontWeight: 500, marginBottom: '0.75rem', lineHeight: 1.6 }}>{q.text}</p>
                  <QuestionSummary q={q} />
                  {q.explanation && (
                    <div style={{ marginTop: '0.625rem', padding: '0.5rem 0.75rem', background: 'var(--bg3)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text3)', borderLeft: '2px solid var(--accent)' }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditQ(q)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteQ(q.id)} disabled={deleting === q.id}>
                    {deleting === q.id ? <Spinner sm /> : 'Del'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      }

      {(showAddQ || editQ) && (
        <QuestionModal
          quizId={quiz.id} editQ={editQ} token={token} toast={toast}
          categories={categories}
          onClose={() => { setShowAddQ(false); setEditQ(null) }}
          onSaved={() => { setShowAddQ(false); setEditQ(null); reload(); onUpdated() }}
        />
      )}
    </div>
  )
}

// ── Quiz form modal ──────────────────────────────────────────────────────────
function QuizFormModal({ editQuiz, token, toast, onClose, onSaved }) {
  const [form, setForm] = useState(editQuiz ? {
    title: editQuiz.title, description: editQuiz.description || '',
    subject: editQuiz.subject, topic: editQuiz.topic || '', difficulty: editQuiz.difficulty,
    quiz_type: editQuiz.quiz_type || 'scheduled',
    scheduled_start: editQuiz.scheduled_start ? editQuiz.scheduled_start.slice(0, 16) : '',
    scheduled_end: editQuiz.scheduled_end ? editQuiz.scheduled_end.slice(0, 16) : '',
    randomize_questions: !!editQuiz.randomize_questions,
    randomize_answers: !!editQuiz.randomize_answers,
    random_question_count: editQuiz.random_question_count ?? '',
    random_question_categories: (editQuiz.random_question_categories || []).join(', '),
    allow_navigation: editQuiz.allow_navigation ?? true,
    allow_bookmarking: editQuiz.allow_bookmarking ?? true,
    allow_question_review: editQuiz.allow_question_review ?? true,
    show_results: editQuiz.show_results ?? true,
    show_answers: editQuiz.show_answers ?? false,
  } : { ...emptyQuiz })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const save = async () => {
    if (!form.title.trim()) return toast('Title is required', 'error')
    setSaving(true)
    try {
      const payload = {
        ...form,
        scheduled_start: form.scheduled_start || null,
        scheduled_end: form.scheduled_end || null,
        random_question_count: form.random_question_count === '' ? null : Number(form.random_question_count),
        random_question_categories: (form.random_question_categories || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      }
      if (editQuiz) await api.updateQuiz(token, editQuiz.id, payload)
      else await api.createQuiz(token, payload)
      toast(editQuiz ? 'Quiz updated!' : 'Quiz created!', 'success')
      onSaved()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={editQuiz ? 'Edit Quiz' : 'Create New Quiz'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="input-group">
          <label className="input-label">Title</label>
          <input className="input" value={form.title} onChange={f('title')} placeholder="e.g. Physics – Newton's Laws" />
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={f('description')} placeholder="Brief description..." style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <Select label="Subject" value={form.subject} onChange={value => setForm(prev => ({ ...prev, subject: value }))} options={SUBJECTS.map(value => ({ value, label: value }))} />
          <div className="input-group">
            <label className="input-label">Topic</label>
            <input className="input" value={form.topic} onChange={f('topic')} placeholder="e.g. Algebra" />
          </div>
          <Select label="Difficulty" value={form.difficulty} onChange={value => setForm(prev => ({ ...prev, difficulty: value }))} options={DIFFS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
        </div>
        <div className="card" style={{ padding: '0.9rem', background: 'var(--bg3)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Question display settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select label="Randomize question order" value={String(!!form.randomize_questions)} onChange={value => setForm(prev => ({ ...prev, randomize_questions: value === 'true' }))} options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} />
            <Select label="Randomize answer options" value={String(!!form.randomize_answers)} onChange={value => setForm(prev => ({ ...prev, randomize_answers: value === 'true' }))} options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} />
            <label className="input-group">
              <span className="input-label">Random questions from bank</span>
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Leave blank for all questions"
                value={form.random_question_count}
                onChange={f('random_question_count')}
              />
            </label>
            <label className="input-group" style={{ gridColumn: '1 / -1' }}>
              <span className="input-label">Limit random questions to categories</span>
              <input
                className="input"
                value={form.random_question_categories}
                onChange={f('random_question_categories')}
                placeholder="Comma-separated, e.g. Algebra, Geometry"
              />
            </label>
            <Select label="Allow navigation" value={String(!!form.allow_navigation)} onChange={value => setForm(prev => ({ ...prev, allow_navigation: value === 'true' }))} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
            <Select label="Allow bookmarking" value={String(!!form.allow_bookmarking)} onChange={value => setForm(prev => ({ ...prev, allow_bookmarking: value === 'true' }))} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
            <Select label="Allow question review" value={String(!!form.allow_question_review)} onChange={value => setForm(prev => ({ ...prev, allow_question_review: value === 'true' }))} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
            <Select label="Show results after submit" value={String(!!form.show_results)} onChange={value => setForm(prev => ({ ...prev, show_results: value === 'true' }))} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
            <Select label="Show correct answers" value={String(!!form.show_answers)} onChange={value => setForm(prev => ({ ...prev, show_answers: value === 'true' }))} options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} />
          </div>
        </div>
        <Select label="Type" value={form.quiz_type} onChange={value => setForm(prev => ({ ...prev, quiz_type: value }))} options={QUIZ_TYPES.map(value => ({ value, label: value === 'live' ? 'Live (hosted only — hidden from users)' : 'Scheduled (self-paced, shown to users)' }))} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="input-group">
            <label className="input-label">Scheduled Start</label>
            <input className="input" type="datetime-local" value={form.scheduled_start} onChange={f('scheduled_start')} />
          </div>
          <div className="input-group">
            <label className="input-label">Scheduled End</label>
            <input className="input" type="datetime-local" value={form.scheduled_end} onChange={f('scheduled_end')} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner sm /> : editQuiz ? 'Save Changes' : 'Create Quiz'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Public link modal ────────────────────────────────────────────────────────
function PublicLinkModal({ quiz, token, toast, onClose, onUpdated }) {
  const [isPublic, setIsPublic] = useState(!!quiz.is_public)
  const [slug, setSlug] = useState(quiz.public_slug || '')
  const [working, setWorking] = useState(false)

  const enable = async () => {
    setWorking(true)
    try {
      const res = await api.enablePublicLink(token, quiz.id)
      setIsPublic(res.is_public)
      setSlug(res.public_slug)
      onUpdated()
      toast('Public link enabled', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setWorking(false) }
  }

  const disable = async () => {
    setWorking(true)
    try {
      const res = await api.disablePublicLink(token, quiz.id)
      setIsPublic(res.is_public)
      onUpdated()
      toast('Public link disabled', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setWorking(false) }
  }

  const link = slug ? `${FRONTEND_BASE}public/${slug}` : ''

  return (
    <Modal title={`Public Link — ${quiz.title}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
          Anyone with this link can take the quiz without an account. They'll enter their name (and
          optionally email) before starting.
        </p>

        {isPublic && link ? (
          <div className="input-group">
            <label className="input-label">Shareable link</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="input" readOnly value={link} style={{ flex: 1 }} />
              <CopyButton value={link} label="Copy" />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--text3)' }}>Link is currently off.</div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {isPublic ? (
            <button className="btn btn-danger" onClick={disable} disabled={working}>
              {working ? <Spinner sm /> : 'Disable link'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={enable} disabled={working}>
              {working ? <Spinner sm /> : 'Enable public link'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminQuizzes() {
  const { token } = useAuth()
  const toast = useToast()
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDiff, setFilterDiff] = useState('All')
  const [filterSubject, setFilterSubject] = useState('All')
  const [filterType, setFilterType] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [editQuiz, setEditQuiz] = useState(null)
  const [attemptsModal, setAttemptsModal] = useState(null)
  const [detailQuiz, setDetailQuiz] = useState(null)
  const [publicLinkModal, setPublicLinkModal] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    setLoading(true)

    const params = new URLSearchParams()

    if (filterDiff !== 'All') {
      params.set('difficulty', filterDiff)
    }

    if (filterSubject !== 'All') {
      params.set('subject', filterSubject)
    }

    if (filterType !== 'All') {
      params.set('quiz_type', filterType)
    }

    const q = params.toString() ? `?${params}` : ''

    try {
      const data = await api.adminQuizzes(token, q)
      setQuizzes(data)
    }
    catch (e) {
      toast(e.message, 'error')
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [filterDiff, filterSubject, filterType])

 const getQuetions = async (id) => {
  try {
     setLoading(true)
    const q = await api.adminQuiz(token, id)
    setDetailQuiz(q)
  }
  catch (e) {
    toast(e.message, 'error')
  }
  finally{
    setLoading(false)
  }
}

  const deleteQuiz = async (id) => {
    if (!window.confirm('Delete this quiz and all its questions?')) return
    setDeleting(id)
    try { await api.deleteQuiz(token, id); toast('Quiz deleted', 'success'); setQuizzes(qs => qs.filter(q => q.id !== id)) }
    catch (e) { toast(e.message, 'error') }
    finally { setDeleting(null) }
  }

  if (detailQuiz) return (
    <div className="page-wrap">
      <QuizDetail quiz={detailQuiz} token={token} toast={toast}
        onBack={() => { setDetailQuiz(null); load() }} onUpdated={load} />
    </div>
  )

  return (
    <div className="page-wrap">
      <div className="flex justify-between items-center fade-up" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Manage Quizzes</h1>
          <p className="page-sub">Create, edit, and manage quiz content</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Quiz</button>
      </div>

      <div className="flex gap-2 fade-up-1" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Select label="Subject" value={filterSubject} onChange={setFilterSubject} className="min-w-[150px]" options={['All', ...SUBJECTS].map(value => ({ value, label: value }))} />
        <Select label="Difficulty" value={filterDiff} onChange={setFilterDiff} className="min-w-[145px]" options={['All', ...DIFFS].map(value => ({ value, label: value === 'All' ? value : value[0].toUpperCase() + value.slice(1) }))} />
        <Select label="Type" value={filterType} onChange={setFilterType} className="min-w-[135px]" options={['All', ...QUIZ_TYPES].map(value => ({ value, label: value === 'All' ? value : value[0].toUpperCase() + value.slice(1) }))} />
      </div>

      {loading ? <Loading /> : quizzes.length === 0
        ? <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text3)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <div style={{ fontSize: '1.1rem', color: 'var(--text2)', marginBottom: '0.5rem' }}>No quizzes found</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Create your first quiz to get started.</div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Quiz</button>
        </div>
        : <div className="card fade-up-2" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th><th>Subject / Topic</th><th>Difficulty</th><th>Type</th>
                  <th>Questions</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q, i) => {
                  const now = new Date()
                  const start = q.scheduled_start ? new Date(q.scheduled_start) : null
                  const end = q.scheduled_end ? new Date(q.scheduled_end) : null
                  const isLive = (!start || now >= start) && (!end || now <= end)
                  const isUpcoming = start && now < start
                  const isEnded = end && now > end
                  return (
                    <tr key={q.id} className="fade-up" style={{ animationDelay: `${i * 0.03}s` }}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {q.title}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.875rem' }}>{q.subject}</div>
                        {q.topic && <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{q.topic}</div>}
                      </td>
                      <td><DiffBadge level={q.difficulty} /></td>
                      <td>
                        <span className={`badge ${q.quiz_type === 'live' ? 'badge-blue' : 'badge-gray'}`}>
                          {q.quiz_type === 'live' ? '📡 Live' : 'Scheduled'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{q.question_count ?? 0}</span>
                        <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}> Qs</span>
                      </td>
                      <td>
                        {isUpcoming && <span className="badge badge-blue">Upcoming</span>}
                        {isLive && !isEnded && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--accent)' }}>
                            <span className="live-dot" />LIVE
                          </span>
                        )}
                        {isEnded && <span className="badge badge-gray">Ended</span>}
                        {!start && !end && <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>Always open</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              getQuetions(q.id)
                              // console.log(q.id)
                            }}
                          >
                            Questions
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAttemptsModal(q)}>Attempts</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setPublicLinkModal(q)}>
                            {q.is_public ? '🔗 Link on' : 'Public link'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditQuiz(q)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteQuiz(q.id)} disabled={deleting === q.id}>
                            {deleting === q.id ? <Spinner sm /> : 'Del'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      }

      {(showCreate || editQuiz) && (
        <QuizFormModal editQuiz={editQuiz} token={token} toast={toast}
          onClose={() => { setShowCreate(false); setEditQuiz(null) }}
          onSaved={() => { setShowCreate(false); setEditQuiz(null); load() }}
        />
      )}

      {attemptsModal && (
        <AttemptsModal quizId={attemptsModal.id} quizTitle={attemptsModal.title}
          token={token} onClose={() => setAttemptsModal(null)} />
      )}

      {publicLinkModal && (
        <PublicLinkModal quiz={publicLinkModal} token={token} toast={toast}
          onClose={() => setPublicLinkModal(null)} onUpdated={load} />
      )}
    </div>
  )
}
