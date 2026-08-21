import * as XLSX from 'xlsx'

// Turns quiz-attempt rows into a downloadable .xlsx report.
// `attempts` is the raw array returned by api.quizAttempts (id, user: {username,
// name, email, ...}, score, total, submitted_at | null for in-progress).
export function exportAttemptsToExcel(quizTitle, attempts) {
  const rows = attempts.map(a => {
    const done = !!a.submitted_at
    const pct = done && a.total ? Math.round((a.score / a.total) * 100) : null
    return {
      'User': a.user?.username || '—',
      'Full Name': a.user?.name || '—',
      'Email': a.user?.email || '—',
      'Score': done ? a.score : '',
      'Total': done ? a.total : '',
      'Percentage': pct != null ? `${pct}%` : '',
      'Status': done ? 'Completed' : 'In progress',
      'Submitted At': done ? new Date(a.submitted_at).toLocaleString() : '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 20 }, // User
    { wch: 24 }, // Full Name
    { wch: 28 }, // Email
    { wch: 8 },  // Score
    { wch: 8 },  // Total
    { wch: 12 }, // Percentage
    { wch: 14 }, // Status
    { wch: 22 }, // Submitted At
  ]

  // Small summary block appended below the table.
  const completed = rows.filter(r => r.Status === 'Completed')
  const avgPct = completed.length
    ? Math.round(completed.reduce((sum, r) => sum + parseInt(r.Percentage, 10), 0) / completed.length)
    : null
  XLSX.utils.sheet_add_aoa(ws, [
    [],
    ['Total attempts', attempts.length],
    ['Completed', completed.length],
    ['In progress', attempts.length - completed.length],
    ['Average score', avgPct != null ? `${avgPct}%` : '—'],
  ], { origin: -1 })

  const wb = XLSX.utils.book_new()
  const sheetName = (quizTitle || 'Attempts').replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Attempts'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const fileSafeTitle = (quizTitle || 'quiz').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'quiz'
  const datestamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${fileSafeTitle}_attempts_${datestamp}.xlsx`)
}
