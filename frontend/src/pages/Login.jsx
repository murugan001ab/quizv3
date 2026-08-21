import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Spinner } from '../components/Shared'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.username, form.password)
      toast('Welcome back! 👋', 'success')
      // If they arrived here via a shared link (e.g. /live/:code/:link_token)
      // that redirected them to log in first, send them back to it instead
      // of the default dashboard.
      const dest = from ? `${from.pathname}${from.search || ''}` : (user.is_admin ? '/admin' : '/dashboard')
      navigate(dest, { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-card fade-up">
        <div className="auth-logo">Quiz<span>Master</span></div>
        <div className="auth-subtitle">Sign in to continue learning</div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Username</label>
            <input className="input" placeholder="your_username" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button className="btn btn-primary btn-lg w-full mt-2" type="submit" disabled={loading}>
            {loading ? <Spinner sm /> : 'Sign In'}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  )
}
