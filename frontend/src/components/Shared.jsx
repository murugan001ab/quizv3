import { useEffect, useMemo, useRef, useState } from 'react'

export function CopyButton({ value, label = 'Copy', className = '', variant = 'ghost' }) {
  const [copied, setCopied] = useState(false)

  const doCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Fallback for non-secure contexts / older browsers
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const base = variant === 'ghost'
    ? 'btn btn-ghost btn-sm'
    : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/[0.09] hover:text-white transition-all duration-200'

  return (
    <button
      type="button"
      onClick={doCopy}
      className={`${base} relative overflow-hidden ${copied ? '!border-accent-400/50 !text-accent-300' : ''} ${className}`}
    >
      <span className="relative inline-flex items-center justify-center w-3.5 h-3.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute inset-0 w-3.5 h-3.5 transition-all duration-300 ease-out ${copied ? 'opacity-0 scale-50 rotate-12' : 'opacity-100 scale-100 rotate-0'}`}
        >
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute inset-0 w-3.5 h-3.5 text-accent-300 transition-all duration-300 ease-out ${copied ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-12'}`}
        >
          <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="transition-all duration-200">{copied ? 'Copied!' : label}</span>
    </button>
  )
}

export function Select({
  label, value, options, onChange, className = '', placeholder = 'Select…',
  disabled = false, buttonClassName = '', menuClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = useMemo(
    () => options.find(opt => String(opt.value) === String(value)),
    [options, value]
  )

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  return (
    <div ref={ref} className={`custom-select relative ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <button
        type="button"
        className={`input custom-select-trigger flex items-center justify-between gap-3 text-left ${buttonClassName}`}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className={`custom-select-menu absolute z-50 mt-2 w-full overflow-y-auto rounded-2xl ${menuClassName}`}>
          {options.map(opt => {
            const active = String(opt.value) === String(value)
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={active}
                className={`custom-select-option ${active ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function DiffBadge({ level }) {
  const cls = {
    easy: 'badge-easy', medium: 'badge-medium', hard: 'badge-hard',
    basic: 'badge-easy', intermediate: 'badge-medium', advanced: 'badge-hard',
  }[level] || 'badge-gray'
  return <span className={cls}>{level}</span>
}

export function SubjectTag({ subject }) {
  if (!subject) return null
  return <span className="tag">{subject}</span>
}

export function Spinner({ sm }) {
  return <div className={`spinner ${sm ? 'spinner-sm' : ''}`} />
}

export function Loading() {
  return (
    <div className="flex items-center justify-center h-[40vh]">
      <div className="spinner" />
    </div>
  )
}

export function EmptyState({ icon = '📭', title, sub, action }) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center text-center py-16 px-6 fade-up">
      <div className="text-4xl mb-4 opacity-80">{icon}</div>
      <h3 className="font-head font-bold text-lg text-white/90">{title}</h3>
      {sub && <p className="text-sm text-white/40 mt-2 mb-6 max-w-xs">{sub}</p>}
      {action}
    </div>
  )
}

export function Modal({ title, onClose, children, size = 'default' }) {
  const width = size === 'wide' ? 'max-w-4xl' : size === 'large' ? 'max-w-2xl' : 'max-w-lg'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-space-950/70 backdrop-blur-md p-4 animate-[fadeUp_0.25s_ease-out]"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`glass-panel w-full ${width} max-h-[88vh] overflow-y-auto p-7 shadow-glass-lg`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-head font-bold text-xl text-white/90">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ScheduleInfo({ start, end }) {
  const fmt = d => d ? new Date(d).toLocaleString() : '—'
  return (
    <div className="flex gap-4 flex-wrap text-xs text-white/40">
      <span>🗓 Start: <b className="text-white/60 font-medium">{fmt(start)}</b></span>
      <span>⏰ End: <b className="text-white/60 font-medium">{fmt(end)}</b></span>
    </div>
  )
}

export function QuizCard({ quiz, onClick, actions }) {
  const now = new Date()
  const start = quiz.scheduled_start ? new Date(quiz.scheduled_start) : null
  const end = quiz.scheduled_end ? new Date(quiz.scheduled_end) : null
  const isLive = (!start || now >= start) && (!end || now <= end)
  const isUpcoming = start && now < start
  const isEnded = end && now > end

  return (
    <div
      onClick={onClick}
      className="glass-panel glass-hover fade-up cursor-pointer flex flex-col gap-3 p-5"
    >
      <div className="flex justify-between items-center">
        <DiffBadge level={quiz.difficulty} />
        {isLive && !isEnded && (
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium text-accent-300">
            <span className="live-dot" /> LIVE
          </span>
        )}
        {isUpcoming && <span className="badge-blue">UPCOMING</span>}
        {isEnded && <span className="badge-gray">ENDED</span>}
      </div>

      <div>
        <div className="font-head font-bold text-[1.05rem] text-white/90 mb-1">{quiz.title}</div>
        <div className="text-sm text-white/40 line-clamp-2">{quiz.description}</div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <SubjectTag subject={quiz.subject} />
        <SubjectTag subject={quiz.topic} />
      </div>

      <div className="flex justify-between items-center mt-auto pt-3 border-t border-white/10">
        <span className="text-xs text-white/40">📝 {quiz.question_count} questions</span>
        {actions}
      </div>
    </div>
  )
}
