import { Select } from './Shared'

// ─────────────────────────────────────────────────────────────────────────
// Shared answer UI for every question type (multiple_choice, multiple_select,
// true_false, short_answer, essay, matching).
//
// TakeQuiz.jsx, PublicTakeQuiz.jsx, and Result.jsx all render through the
// three exports here instead of assuming multiple-choice, so a new question
// type only needs a branch added in each of AnswerInput / AnswerReview /
// gradeStatus — the same registry-style pattern as QuestionEditor.jsx on the
// admin side and app/services/question_types.py on the backend.
//
// Answer value shapes (must match SubmitAnswers on the backend):
//   multiple_choice / true_false → number (option index)
//   multiple_select              → number[] (option indices)
//   short_answer / essay         → string
//   matching                     → { [leftIndex]: rightIndex }
// ─────────────────────────────────────────────────────────────────────────

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F']

export function isAnswered(q, value) {
  const type = q.question_type || 'multiple_choice'
  if (type === 'multiple_select') return Array.isArray(value) && value.length > 0
  if (type === 'matching') {
    const leftCount = q.matching_data?.left?.length || 0
    return !!value && typeof value === 'object' && Object.keys(value).length === leftCount && leftCount > 0
  }
  if (type === 'short_answer' || type === 'essay') return typeof value === 'string' && value.trim().length > 0
  return value !== undefined && value !== null
}

// ── interactive input (taking the quiz) ─────────────────────────────────
export function AnswerInput({ q, value, onChange }) {
  const type = q.question_type || 'multiple_choice'

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div className="flex flex-col gap-2.5">
        {q.options.map((opt, i) => {
          const originalIdx = q.optionOrder ? q.optionOrder[i] : i
          return (
            <button
              key={i}
              className={`option-btn ${value === originalIdx ? 'selected' : ''}`}
              onClick={() => onChange(originalIdx)}
            >
              <span className="option-key">{KEYS[i] || i + 1}</span>
              <span className="flex-1 text-left leading-normal">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (type === 'multiple_select') {
    const selected = Array.isArray(value) ? value : []
    const toggle = (originalIdx) => {
      const has = selected.includes(originalIdx)
      onChange(has ? selected.filter(x => x !== originalIdx) : [...selected, originalIdx].sort((a, b) => a - b))
    }
    return (
      <div className="flex flex-col gap-2.5">
        {q.options.map((opt, i) => {
          const originalIdx = q.optionOrder ? q.optionOrder[i] : i
          const isSelected = selected.includes(originalIdx)
          return (
            <button
              key={i}
              className={`option-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => toggle(originalIdx)}
            >
              <span className="option-key">{isSelected ? '✓' : (KEYS[i] || i + 1)}</span>
              <span className="flex-1 text-left leading-normal">{opt}</span>
            </button>
          )
        })}
        <p className="text-xs text-white/35 mt-0.5">Select every answer that applies.</p>
      </div>
    )
  }

  if (type === 'short_answer') {
    return (
      <input
        className="input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Type your answer..."
      />
    )
  }

  if (type === 'essay') {
    return (
      <textarea
        className="input"
        rows={8}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Write your response..."
        style={{ resize: 'vertical' }}
      />
    )
  }

  if (type === 'matching') {
    const { left = [], right = [] } = q.matching_data || {}
    const mapping = (value && typeof value === 'object') ? value : {}
    const setMap = (leftIdx, rightIdx) => onChange({ ...mapping, [leftIdx]: rightIdx })
    return (
      <div className="flex flex-col gap-2.5">
        {left.map((item, i) => (
          <div key={i} className="flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-[140px] text-white/80 text-sm">{item}</span>
            <span className="text-white/30">→</span>
            <Select className="flex-1 min-w-[160px]" value={String(mapping[i] ?? '')}
              onChange={next => setMap(i, Number(next))} placeholder="Select match…"
              options={right.map((r, j) => ({ value: String(j), label: r }))}
            />
          </div>
        ))}
      </div>
    )
  }

  return null
}

// ── correctness, for display only — actual scoring is always server-side ──
export function gradeStatus(q, given) {
  const type = q.question_type || 'multiple_choice'

  if (type === 'essay') {
    return isAnswered(q, given) ? 'pending' : 'skipped'
  }
  if (!isAnswered(q, given)) return 'skipped'

  if (type === 'multiple_choice' || type === 'true_false') {
    return given === q.correct_option ? 'correct' : 'wrong'
  }
  if (type === 'multiple_select') {
    const a = new Set(given || [])
    const b = new Set(q.correct_options || [])
    const same = a.size === b.size && [...a].every(x => b.has(x))
    return same ? 'correct' : 'wrong'
  }
  if (type === 'short_answer') {
    const norm = s => (q.case_sensitive ? s : String(s).trim().toLowerCase())
    const match = (q.expected_answers || []).some(exp => norm(exp) === norm(given))
    return match ? 'correct' : 'wrong'
  }
  if (type === 'matching') {
    const mapping = q.matching_data?.correct_mapping || {}
    const keys = Object.keys(mapping)
    const same = keys.length > 0 && keys.length === Object.keys(given || {}).length
      && keys.every(k => Number(given[k]) === Number(mapping[k]))
    return same ? 'correct' : 'wrong'
  }
  return 'wrong'
}

// ── post-submission review ──────────────────────────────────────────────
export function AnswerReview({ q, given }) {
  const type = q.question_type || 'multiple_choice'

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((opt, j) => {
          const isChosen = given === j
          const isCorrect = q.correct_option === j
          return (
            <div key={j} className="option-btn cursor-default">
              <span className="option-key">{KEYS[j] || j + 1}</span>
              <span className="flex-1 leading-normal">{opt}</span>
              {isCorrect && <span className="ml-auto text-[0.72rem] text-emerald-300 font-bold whitespace-nowrap">✓ Correct</span>}
              {isChosen && !isCorrect && <span className="ml-auto text-[0.72rem] text-rose-400 font-bold whitespace-nowrap">Your answer</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (type === 'multiple_select') {
    const chosen = Array.isArray(given) ? given : []
    const correctSet = q.correct_options || []
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((opt, j) => {
          const isChosen = chosen.includes(j)
          const isCorrect = correctSet.includes(j)
          return (
            <div key={j} className="option-btn cursor-default">
              <span className="option-key">{isCorrect ? '✓' : (KEYS[j] || j + 1)}</span>
              <span className="flex-1 leading-normal">{opt}</span>
              {isCorrect && <span className="ml-auto text-[0.72rem] text-emerald-300 font-bold whitespace-nowrap">✓ Correct</span>}
              {isChosen && !isCorrect && <span className="ml-auto text-[0.72rem] text-rose-400 font-bold whitespace-nowrap">Your answer</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (type === 'short_answer') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="option-btn cursor-default">
          <span className="flex-1 leading-normal">
            {given && String(given).trim() ? given : <span className="text-white/30 italic">No answer</span>}
          </span>
        </div>
        <div className="text-xs text-white/40">Accepted: {(q.expected_answers || []).join(', ')}</div>
      </div>
    )
  }

  if (type === 'essay') {
    return (
      <div className="option-btn cursor-default" style={{ alignItems: 'flex-start' }}>
        <span className="flex-1 leading-relaxed whitespace-pre-wrap">
          {given && String(given).trim() ? given : <span className="text-white/30 italic">No answer</span>}
        </span>
      </div>
    )
  }

  if (type === 'matching') {
    const { left = [], right = [], correct_mapping = {} } = q.matching_data || {}
    const chosen = (given && typeof given === 'object') ? given : {}
    return (
      <div className="flex flex-col gap-2 text-sm">
        {left.map((item, i) => {
          const chosenIdx = chosen[i]
          const correctIdx = correct_mapping[i]
          const isCorrect = chosenIdx !== undefined && Number(chosenIdx) === Number(correctIdx)
          return (
            <div key={i} className="option-btn cursor-default">
              <span className="flex-1 leading-normal">
                {item} → {chosenIdx !== undefined ? (right[chosenIdx] ?? '—') : <span className="text-white/30 italic">No answer</span>}
              </span>
              {isCorrect
                ? <span className="ml-auto text-[0.72rem] text-emerald-300 font-bold whitespace-nowrap">✓ Correct</span>
                : <span className="ml-auto text-[0.72rem] text-rose-400 font-bold whitespace-nowrap">Should be {right[correctIdx] ?? '—'}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
