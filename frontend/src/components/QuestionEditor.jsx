import { useState } from 'react'
import { Spinner, Select } from './Shared'

// ─────────────────────────────────────────────────────────────────────────
// Reusable Question Editor.
//
// Supports every type in QuestionType (app/models/quiz.py): multiple_choice,
// multiple_select, true_false, short_answer, essay, matching.
//
// To add a new question type later:
//   1. Add it to QUESTION_TYPES below (label shown in the type dropdown)
//   2. Add its default shape to emptyForm() / fromExisting()
//   3. Add a branch in the "type-specific body" section that renders its
//      editing UI
//   4. Add a case to validate() for its required-fields check
// The backend's per-type validation/grading (app/services/question_types.py)
// already follows the same registry pattern, so a new type only needs to be
// wired up in these two places.
// ─────────────────────────────────────────────────────────────────────────

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F']
const DIFFICULTIES = ['easy', 'medium', 'hard']

export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '◉' },
  { value: 'multiple_select', label: 'Multiple Select', icon: '☑' },
  { value: 'true_false', label: 'True / False', icon: '⊤⊥' },
  { value: 'short_answer', label: 'Short Answer', icon: '✎' },
  { value: 'essay', label: 'Essay', icon: '📝' },
  { value: 'matching', label: 'Matching', icon: '⇄' },
]

export function questionTypeLabel(type) {
  return QUESTION_TYPES.find(t => t.value === type)?.label || type
}

function emptyForm(type = 'multiple_choice') {
  return {
    text: '',
    question_type: type,
    options: type === 'true_false' ? ['True', 'False'] : ['', ''],
    correct_option: type === 'true_false' ? 0 : null,
    correct_options: [],
    partial_scoring: false,
    expected_answers: [''],
    case_sensitive: false,
    matching_data: { left: ['', ''], right: ['', ''], correct_mapping: {} },
    explanation: '',
    points: 1,
    tags: [],
    correct_feedback: '',
    incorrect_feedback: '',
    category: '',
    difficulty: '',
    is_active: true,
  }
}

function fromExisting(q) {
  return {
    text: q.text || '',
    question_type: q.question_type || 'multiple_choice',
    options: q.options?.length ? [...q.options] : (q.question_type === 'true_false' ? ['True', 'False'] : ['', '']),
    correct_option: q.correct_option ?? null,
    correct_options: q.correct_options?.length ? [...q.correct_options] : [],
    partial_scoring: !!q.partial_scoring,
    expected_answers: q.expected_answers?.length ? [...q.expected_answers] : [''],
    case_sensitive: !!q.case_sensitive,
    matching_data: q.matching_data?.left?.length ? {
      left: [...q.matching_data.left],
      right: [...q.matching_data.right],
      correct_mapping: { ...q.matching_data.correct_mapping },
    } : { left: ['', ''], right: ['', ''], correct_mapping: {} },
    explanation: q.explanation || '',
    points: q.points ?? 1,
    tags: q.tags || [],
    correct_feedback: q.correct_feedback || '',
    incorrect_feedback: q.incorrect_feedback || '',
    category: q.category || '',
    difficulty: q.difficulty || '',
    is_active: q.is_active !== false,
  }
}

function validate(form) {
  if (!form.text.trim()) return 'Question text is required'
  switch (form.question_type) {
    case 'multiple_choice':
      if (form.options.length < 2) return 'At least 2 options are required'
      if (form.options.some(o => !o.trim())) return 'All options must be filled in'
      if (form.correct_option === null || form.correct_option === undefined) return 'Select the correct option'
      return null
    case 'true_false':
      if (form.correct_option !== 0 && form.correct_option !== 1) return 'Select True or False'
      return null
    case 'multiple_select':
      if (form.options.length < 2) return 'At least 2 options are required'
      if (form.options.some(o => !o.trim())) return 'All options must be filled in'
      if (form.correct_options.length === 0) return 'Select at least one correct option'
      return null
    case 'short_answer':
      if (!form.expected_answers.some(a => a.trim())) return 'Add at least one accepted answer'
      return null
    case 'essay':
      return null
    case 'matching': {
      const { left, right, correct_mapping } = form.matching_data
      if (left.length < 2 || right.length < 2) return 'Matching needs at least 2 items on each side'
      if (left.some(l => !l.trim()) || right.some(r => !r.trim())) return 'Fill in every matching item'
      if (Object.keys(correct_mapping).length !== left.length) return 'Map every left item to a right option'
      return null
    }
    default:
      return null
  }
}

function toPayload(form) {
  return {
    text: form.text.trim(),
    question_type: form.question_type,
    options: ['multiple_choice', 'multiple_select', 'true_false'].includes(form.question_type) ? form.options : [],
    correct_option: ['multiple_choice', 'true_false'].includes(form.question_type) ? form.correct_option : null,
    correct_options: form.question_type === 'multiple_select' ? form.correct_options : [],
    partial_scoring: form.question_type === 'multiple_select' ? form.partial_scoring : false,
    expected_answers: form.question_type === 'short_answer' ? form.expected_answers.filter(a => a.trim()) : [],
    case_sensitive: form.question_type === 'short_answer' ? form.case_sensitive : false,
    matching_data: form.question_type === 'matching' ? form.matching_data : {},
    explanation: form.explanation.trim() || null,
    points: Number(form.points) || 0,
    tags: form.tags,
    correct_feedback: form.correct_feedback.trim() || null,
    incorrect_feedback: form.incorrect_feedback.trim() || null,
    category: form.category.trim() || null,
    difficulty: form.difficulty || null,
    is_active: form.is_active,
  }
}

/**
 * @param initial   existing question (from the API) to edit, or null to add
 * @param onSubmit  async (payload) => void — parent does the actual
 *                  api.addQuestion / api.updateQuestion call
 * @param onCancel  () => void
 * @param toast     (message, type) => void — used for validation errors
 * @param categories string[] — known categories, offered as autocomplete
 */
export default function QuestionEditor({ initial, onSubmit, onCancel, toast, categories = [] }) {
  const [form, setForm] = useState(initial ? fromExisting(initial) : emptyForm())
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const changeType = (type) => {
    setForm(f => ({
      ...emptyForm(type),
      text: f.text,
      explanation: f.explanation,
      points: f.points,
      tags: f.tags,
      correct_feedback: f.correct_feedback,
      incorrect_feedback: f.incorrect_feedback,
      category: f.category,
      difficulty: f.difficulty,
      is_active: f.is_active,
    }))
  }

  // ── options (MCQ / multiple_select) ──
  const setOpt = (i, val) => setForm(f => { const o = [...f.options]; o[i] = val; return { ...f, options: o } })
  const addOpt = () => setForm(f => ({ ...f, options: [...f.options, ''] }))
  const removeOpt = (i) => setForm(f => {
    const options = f.options.filter((_, idx) => idx !== i)
    const correct_option = f.correct_option === i ? null : (f.correct_option > i ? f.correct_option - 1 : f.correct_option)
    const correct_options = f.correct_options.filter(x => x !== i).map(x => x > i ? x - 1 : x)
    return { ...f, options, correct_option, correct_options }
  })
  const toggleMultiCorrect = (i) => setForm(f => {
    const has = f.correct_options.includes(i)
    return { ...f, correct_options: has ? f.correct_options.filter(x => x !== i) : [...f.correct_options, i].sort((a, b) => a - b) }
  })

  // ── expected answers (short answer) ──
  const setAns = (i, val) => setForm(f => { const a = [...f.expected_answers]; a[i] = val; return { ...f, expected_answers: a } })
  const addAns = () => setForm(f => ({ ...f, expected_answers: [...f.expected_answers, ''] }))
  const removeAns = (i) => setForm(f => ({ ...f, expected_answers: f.expected_answers.filter((_, idx) => idx !== i) }))

  // ── matching ──
  const setLeft = (i, val) => setForm(f => { const left = [...f.matching_data.left]; left[i] = val; return { ...f, matching_data: { ...f.matching_data, left } } })
  const setRight = (i, val) => setForm(f => { const right = [...f.matching_data.right]; right[i] = val; return { ...f, matching_data: { ...f.matching_data, right } } })
  const addLeft = () => setForm(f => ({ ...f, matching_data: { ...f.matching_data, left: [...f.matching_data.left, ''] } }))
  const addRight = () => setForm(f => ({ ...f, matching_data: { ...f.matching_data, right: [...f.matching_data.right, ''] } }))
  const removeLeft = (i) => setForm(f => {
    const left = f.matching_data.left.filter((_, idx) => idx !== i)
    const rekeyed = {}
    Object.entries(f.matching_data.correct_mapping).forEach(([k, v]) => {
      const ki = Number(k)
      if (ki === i) return
      rekeyed[ki > i ? ki - 1 : ki] = v
    })
    return { ...f, matching_data: { ...f.matching_data, left, correct_mapping: rekeyed } }
  })
  const removeRight = (i) => setForm(f => {
    const right = f.matching_data.right.filter((_, idx) => idx !== i)
    const mapping = {}
    Object.entries(f.matching_data.correct_mapping).forEach(([k, v]) => {
      if (v === i) return
      mapping[k] = v > i ? v - 1 : v
    })
    return { ...f, matching_data: { ...f.matching_data, right, correct_mapping: mapping } }
  })
  const setMapping = (leftIdx, rightIdx) => setForm(f => ({
    ...f, matching_data: { ...f.matching_data, correct_mapping: { ...f.matching_data.correct_mapping, [leftIdx]: rightIdx } },
  }))

  const setTags = (val) => set('tags', val.split(',').map(t => t.trim()).filter(Boolean))

  const submit = async () => {
    const err = validate(form)
    if (err) { toast(err, 'error'); return }
    setSaving(true)
    try {
      await onSubmit(toPayload(form))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="question-editor">
      <div className="question-editor-header">
        <div>
          <span className="question-editor-kicker">Question builder</span>
          <h3>{initial ? 'Edit question' : 'Create a new question'}</h3>
        </div>
        <span className="question-type-chip">{QUESTION_TYPES.find(t => t.value === form.question_type)?.icon} {questionTypeLabel(form.question_type)}</span>
      </div>

      <div className="question-editor-section">
        <Select label="Question Type" value={form.question_type} onChange={changeType}
          options={QUESTION_TYPES.map(t => ({ value: t.value, label: `${t.icon} ${t.label}` }))} />

        <div className="input-group">
          <label className="input-label">Question Text</label>
          <textarea className="input" rows={4} value={form.text} onChange={e => set('text', e.target.value)}
            placeholder="Write the question students will see..." style={{ resize: 'vertical' }} />
        </div>
      </div>

      {/* ── type-specific body ── */}
      <div className="question-editor-section">
        <div className="question-editor-section-title">
          <span>Answer setup</span>
          <small>Set the expected answer and scoring behaviour</small>
        </div>
        {form.question_type === 'multiple_choice' && (
          <OptionsEditor form={form} setOpt={setOpt} addOpt={addOpt} removeOpt={removeOpt}
            mode="single" onPick={i => set('correct_option', i)} />
        )}

        {form.question_type === 'multiple_select' && (
          <>
            <OptionsEditor form={form} setOpt={setOpt} addOpt={addOpt} removeOpt={removeOpt}
              mode="multi" onToggle={toggleMultiCorrect} />
            <label className="question-editor-check">
              <input type="checkbox" checked={form.partial_scoring} onChange={e => set('partial_scoring', e.target.checked)} />
              Award partial credit for a partially-correct selection
            </label>
          </>
        )}

      {form.question_type === 'true_false' && (
        <div>
          <label className="input-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Correct Answer</label>
          <div className="flex gap-2">
            {['True', 'False'].map((label, i) => (
              <button key={label} type="button"
                className={`btn ${form.correct_option === i ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => set('correct_option', i)}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      {form.question_type === 'short_answer' && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="input-label">Accepted Answers</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addAns}>+ Add</button>
          </div>
          <div className="flex flex-col gap-2">
            {form.expected_answers.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={a} onChange={e => setAns(i, e.target.value)} placeholder={`Accepted answer ${i + 1}`} style={{ flex: 1 }} />
                {form.expected_answers.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAns(i)}>✕</button>
                )}
              </div>
            ))}
          </div>
          <label className="question-editor-check mt-3">
            <input type="checkbox" checked={form.case_sensitive} onChange={e => set('case_sensitive', e.target.checked)} />
            Case-sensitive matching
          </label>
        </div>
      )}

        {form.question_type === 'essay' && (
        <div className="p-3 bg-white/[0.04] rounded-xl text-[0.85rem] text-white/60 border-l-[3px] border-accent-400 leading-relaxed">
          Essay questions collect a free-text response and are always graded manually — they're excluded
          from the automatic score.
        </div>
      )}

        {form.question_type === 'matching' && (
        <MatchingEditor
          form={form} setLeft={setLeft} setRight={setRight}
          addLeft={addLeft} addRight={addRight}
          removeLeft={removeLeft} removeRight={removeRight}
          setMapping={setMapping}
        />
        )}
      </div>

      {/* ── common fields ── */}
      <div className="question-editor-section">
        <div className="question-editor-section-title">
          <span>Details & feedback</span>
          <small>Optional settings to organize and explain the question</small>
        </div>
      <div className="question-editor-grid question-editor-grid-3">
        <div className="input-group">
          <label className="input-label">Points</label>
          <input className="input" type="number" min="0" step="0.5" value={form.points}
            onChange={e => set('points', e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <input className="input" list="question-editor-categories" value={form.category}
            onChange={e => set('category', e.target.value)} placeholder="e.g. Loops" />
          <datalist id="question-editor-categories">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <Select label="Difficulty" value={form.difficulty} onChange={value => set('difficulty', value)}
          options={[{ value: '', label: '— Same as quiz —' }, ...DIFFICULTIES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))]} />
      </div>

      <div className="input-group">
        <label className="input-label">Tags (comma-separated)</label>
        <input className="input" value={form.tags.join(', ')} onChange={e => setTags(e.target.value)} placeholder="e.g. loops, functions" />
      </div>

      <div className="input-group">
        <label className="input-label">Explanation (optional)</label>
        <input className="input" value={form.explanation} onChange={e => set('explanation', e.target.value)} placeholder="Why is the correct answer right?" />
      </div>

      <div className="question-editor-grid question-editor-grid-2">
        <div className="input-group">
          <label className="input-label">Feedback if correct (optional)</label>
          <input className="input" value={form.correct_feedback} onChange={e => set('correct_feedback', e.target.value)} placeholder="Nice work!" />
        </div>
        <div className="input-group">
          <label className="input-label">Feedback if incorrect (optional)</label>
          <input className="input" value={form.incorrect_feedback} onChange={e => set('incorrect_feedback', e.target.value)} placeholder="Review this topic..." />
        </div>
      </div>

      <label className="question-editor-check">
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
        Active (shown when the quiz is taken)
      </label>

      </div>

      <div className="question-editor-actions">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={submit} disabled={saving}>
          {saving ? <Spinner sm /> : initial ? 'Save Changes' : 'Add Question'}
        </button>
      </div>
    </div>
  )
}

// ── options editor (shared by MCQ / multiple_select) ──────────────────────
function OptionsEditor({ form, setOpt, addOpt, removeOpt, mode, onPick, onToggle }) {
  return (
    <div className="question-options">
      <div className="flex justify-between items-center mb-2">
        <label className="input-label">
          Options — {mode === 'single' ? 'click the letter to mark the correct answer' : 'check every correct answer'}
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addOpt}>+ Add option</button>
      </div>
      <div className="flex flex-col gap-2">
        {form.options.map((opt, i) => {
          const isCorrect = mode === 'single' ? form.correct_option === i : form.correct_options.includes(i)
          return (
            <div key={i} className="question-option-row">
              <button type="button"
                onClick={() => mode === 'single' ? onPick(i) : onToggle(i)}
                style={{
                  width: 32, height: 32, borderRadius: 6, flexShrink: 0, border: 'none', cursor: 'pointer',
                  background: isCorrect ? 'var(--accent)' : 'var(--card2)',
                  color: isCorrect ? '#0a0a0f' : 'var(--text3)',
                  fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.75rem',
                }}
              >{mode === 'single' ? KEYS[i] : (isCorrect ? '✓' : KEYS[i])}</button>
              <input className="input" value={opt} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${KEYS[i]}`} style={{ flex: 1 }} />
              {form.options.length > 2 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOpt(i)}>✕</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── matching editor ─────────────────────────────────────────────────────────
function MatchingEditor({ form, setLeft, setRight, addLeft, addRight, removeLeft, removeRight, setMapping }) {
  const { left, right, correct_mapping } = form.matching_data
  return (
    <div className="flex flex-col gap-3">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="input-label">Left items</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addLeft}>+ Add</button>
          </div>
          <div className="flex flex-col gap-2">
            {left.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={item} onChange={e => setLeft(i, e.target.value)} placeholder={`Item ${i + 1}`} />
                {left.length > 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLeft(i)}>✕</button>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="input-label">Right options</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRight}>+ Add</button>
          </div>
          <div className="flex flex-col gap-2">
            {right.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={item} onChange={e => setRight(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                {right.length > 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRight(i)}>✕</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="input-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Correct mapping</label>
        <div className="flex flex-col gap-2">
          {left.map((item, i) => (
            <div key={i} className="flex gap-2 items-center text-sm">
              <span className="text-white/70 truncate" style={{ minWidth: 120, maxWidth: 160 }}>{item || `Item ${i + 1}`}</span>
              <span className="text-white/30">→</span>
              <Select className="flex-1 min-w-[170px]" value={String(correct_mapping[i] ?? '')}
                onChange={value => setMapping(i, Number(value))} placeholder="Select match…"
                options={right.map((r, j) => ({ value: String(j), label: r || `Option ${j + 1}` }))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
