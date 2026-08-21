import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Loading, Spinner } from '../components/Shared'

export default function GroupInvite() {
  const { token } = useAuth()
  const { token: inviteToken } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    api.groupInvite(token, inviteToken).then(setInvite).catch(e => toast(e.message, 'error')).finally(() => setLoading(false))
  }, [token, inviteToken])

  const join = async () => {
    setJoining(true)
    try {
      await api.joinGroupInvite(token, inviteToken)
      toast('Joined group', 'success')
      navigate('/admin/groups')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setJoining(false)
    }
  }

  if (loading) return <Loading />
  if (!invite) {
    return (
      <div className="page-wrap">
        <div className="glass-panel p-10 text-center">
          <h1 className="font-head text-xl font-bold mb-2">Invite not found</h1>
          <button className="btn btn-ghost mt-4" onClick={() => navigate('/')}>Go back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap max-w-[720px]">
      <div className="glass-panel p-8 text-center">
        <div className="text-4xl mb-4">👥</div>
        <h1 className="font-head text-2xl font-bold mb-2">{invite.group_name}</h1>
        <p className="text-white/45 mb-4">{invite.description || 'No description'}</p>
        <div className="text-sm text-white/40 mb-8">
          Shared by {invite.owner_name || 'your teacher'} · {invite.member_count} current member{invite.member_count === 1 ? '' : 's'}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn btn-primary" onClick={join} disabled={joining}>
            {joining ? <Spinner sm /> : 'Join Group'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
