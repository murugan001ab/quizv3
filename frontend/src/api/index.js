const BASE = import.meta.env.VITE_API_URL || ''

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    // detail is sometimes a plain string, sometimes a structured object
    // (e.g. { message, attempt_id, status } from the lazy-expiry routes) —
    // keep both so callers that only read e.message keep working, while
    // callers that need the structured payload can read e.detail.
    const message = typeof err.detail === 'string' ? err.detail : (err.detail?.message || 'Request failed')
    const error = new Error(message)
    error.status = res.status
    error.detail = err.detail
    throw error
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Auth
  register: (data) => req('POST', '/auth/register', data),
  login: async (username, password) => {
    const form = new URLSearchParams({ username, password })
    const res = await fetch(BASE + '/auth/login', { method: 'POST', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(err.detail || 'Login failed')
    }
    return res.json()
  },
  me: (token) => req('GET', '/auth/me', null, token),
  changePassword: (token, data) => req('PUT', '/auth/change-password', data, token),
  uploadProfilePicture: async (token, file) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(BASE + '/auth/profile-picture', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(err.detail || 'Upload failed')
    }
    return res.json()
  },

  // Admin
  adminStats: (token) => req('GET', '/admin/stats', null, token),
  adminUsers: (token) => req('GET', '/admin/users', null, token),
  adminGroups: (token) => req('GET', '/admin/groups', null, token),
  createGroup: (token, data) => req('POST', '/admin/groups', data, token),
  updateGroup: (token, id, data) => req('PUT', `/admin/groups/${id}`, data, token),
  deleteGroup: (token, id) => req('DELETE', `/admin/groups/${id}`, null, token),
  createGroupInvite: (token, id) => req('POST', `/admin/groups/${id}/invite`, null, token),
  revokeGroupInvite: (token, id) => req('DELETE', `/admin/groups/${id}/invite`, null, token),
  addGroupMember: (token, id, data) => req('POST', `/admin/groups/${id}/members`, data, token),
  removeGroupMember: (token, id, studentId) => req('DELETE', `/admin/groups/${id}/members/${studentId}`, null, token),
  adminQuizzes: (token, params = '') => req('GET', `/admin/quizzes${params}`, null, token),
  adminQuiz: (token, id) => req('GET', `/admin/quizzes/${id}`, null, token),
  quizAnalytics: (token, id) => req('GET', `/admin/quizzes/${id}/analytics`, null, token),
  createQuiz: (token, data) => req('POST', '/admin/quizzes', data, token),
  updateQuiz: (token, id, data) => req('PUT', `/admin/quizzes/${id}`, data, token),
  deleteQuiz: (token, id) => req('DELETE', `/admin/quizzes/${id}`, null, token),
  addQuestion: (token, quizId, data) => req('POST', `/admin/quizzes/${quizId}/questions`, data, token),
  importQuestionsCsv: async (token, quizId, file) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(BASE + `/admin/quizzes/${quizId}/questions/import-csv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Import failed' }))
      throw new Error(typeof err.detail === 'string' ? err.detail : (err.detail?.error || 'Import failed'))
    }
    return res.json()
  },
  updateQuestion: (token, qId, data) => req('PUT', `/admin/questions/${qId}`, data, token),
  deleteQuestion: (token, qId) => req('DELETE', `/admin/questions/${qId}`, null, token),
  quizAttempts: (token, quizId) => req('GET', `/admin/quizzes/${quizId}/attempts`, null, token),
  adminAttempts: (token, params = '') => req('GET', `/admin/attempts${params}`, null, token),
  exportAttempts: async (token, params = '') => {
    const res = await fetch(BASE + `/admin/attempts/export${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Export failed' }))
      throw new Error(err.detail || 'Export failed')
    }
    return res.blob()
  },
  adminAttemptResult: (token, attemptId) => req('GET', `/admin/attempts/${attemptId}/result`, null, token),
  adminAttemptActivity: (token, attemptId) => req('GET', `/admin/attempts/${attemptId}/activity`, null, token),
  adminLive: (token) => req('GET', '/admin/live', null, token),
  enablePublicLink: (token, quizId) => req('POST', `/admin/quizzes/${quizId}/public-link`, {}, token),
  disablePublicLink: (token, quizId) => req('DELETE', `/admin/quizzes/${quizId}/public-link`, null, token),
  gradingQueue: (token) => req('GET', '/admin/grading-queue', null, token),
  gradableAnswers: (token, attemptId) => req('GET', `/admin/attempts/${attemptId}/grade`, null, token),
  gradeAttempt: (token, attemptId, grades) => req('POST', `/admin/attempts/${attemptId}/grade`, { grades }, token),

  // Live quiz channels
  createLiveChannel: (token, data) => req('POST', '/live/channels', data, token),
  listLiveChannels: (token) => req('GET', '/live/channels', null, token),
  closeLiveChannel: (token, code) => req('DELETE', `/live/channels/${code}`, null, token),

  // User
  userQuizzes: (token, params = '') => req('GET', `/user/quizzes${params}`, null, token),
  userQuiz: (token, id) => req('GET', `/user/quizzes/${id}`, null, token),
  testInstructions: (token, id) => req('GET', `/user/quizzes/${id}/instructions`, null, token),
  startQuiz: (token, id) => req('POST', `/user/quizzes/${id}/start`, {}, token),
  saveAttemptProgress: (token, attemptId, data) => req('PUT', `/user/attempts/${attemptId}/progress`, data, token),
  recordAttemptEvent: (token, attemptId, data) => req('POST', `/user/attempts/${attemptId}/events`, data, token),
  submitQuiz: (token, attemptId, answers) => req('POST', `/user/attempts/${attemptId}/submit`, { answers }, token),
  myResults: (token) => req('GET', '/user/results', null, token),
  resultDetail: (token, id) => req('GET', `/user/results/${id}`, null, token),
  groupInvite: (token, inviteToken) => req('GET', `/user/groups/invite/${inviteToken}`, null, token),
  joinGroupInvite: (token, inviteToken) => req('POST', '/user/groups/invite/join', { invite_token: inviteToken }, token),

  // Public link (no auth)
  publicQuiz: (slug) => req('GET', `/public/quizzes/${slug}`),
  publicStart: (slug, data) => req('POST', `/public/quizzes/${slug}/start`, data),
  publicSubmit: (attemptToken, attemptId, answers) => req('POST', `/public/attempts/${attemptId}/submit`, { answers }, attemptToken),
  publicResult: (attemptToken, attemptId) => req('GET', `/public/attempts/${attemptId}/result`, null, attemptToken),
}
