import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Loading, Spinner, CopyButton, Select } from '../../components/Shared'

export default function AdminGroups() {
  const { token } = useAuth()
  const toast = useToast()
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })
  const [memberDraft, setMemberDraft] = useState({})
  const [inviteLinks, setInviteLinks] = useState({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [g, u] = await Promise.all([api.adminGroups(token), api.adminUsers(token)])
      setGroups(g)
      setUsers(u.filter(x => !x.is_admin))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filteredGroups = useMemo(
    () => groups.filter(g => `${g.name} ${g.description || ''}`.toLowerCase().includes(search.toLowerCase())),
    [groups, search]
  )

  const createGroup = async () => {
    if (!form.name.trim()) return toast('Group name is required', 'error')
    setSaving(true)
    try {
      await api.createGroup(token, form)
      setForm({ name: '', description: '' })
      toast('Group created', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const renameGroup = async (group) => {
    const name = window.prompt('New group name', group.name)
    if (!name || !name.trim()) return
    try {
      await api.updateGroup(token, group.id, { name })
      toast('Group renamed', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const deleteGroup = async (group) => {
    if (!window.confirm(`Delete group "${group.name}"?`)) return
    try {
      await api.deleteGroup(token, group.id)
      toast('Group deleted', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const addMember = async (groupId) => {
    const studentId = Number(memberDraft[groupId] || 0)
    if (!studentId) return toast('Choose a student', 'error')
    try {
      await api.addGroupMember(token, groupId, { student_id: studentId })
      setMemberDraft(prev => ({ ...prev, [groupId]: '' }))
      toast('Student added', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const getInvite = async (group) => {
    try {
      const invite = await api.createGroupInvite(token, group.id)
      const url = `${window.location.origin}/groups/join/${invite.invite_token}`
      setInviteLinks(prev => ({ ...prev, [group.id]: url }))
      toast('Invite link ready', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const revokeInvite = async (group) => {
    try {
      await api.revokeGroupInvite(token, group.id)
      setInviteLinks(prev => {
        const next = { ...prev }
        delete next[group.id]
        return next
      })
      toast('Invite revoked', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const removeMember = async (groupId, studentId) => {
    try {
      await api.removeGroupMember(token, groupId, studentId)
      toast('Student removed', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const studentsById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

  return (
    <div className="page-wrap">
      <div className="page-header fade-up">
        <h1 className="page-title">Groups & Classes</h1>
        <p className="page-sub">Create class rosters, manage members, and prepare groups for future assignments</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <div className="card h-fit">
          <h2 className="font-head font-bold text-lg mb-4">Create Group</h2>
          <div className="grid gap-3">
            <input className="input" placeholder="Group name" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
            <textarea className="input" rows={3} placeholder="Description" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
            <button className="btn btn-primary" onClick={createGroup} disabled={saving}>
              {saving ? <Spinner sm /> : 'Create Group'}
            </button>
          </div>
          <div className="divider" />
          <input className="input" placeholder="Search groups" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="grid gap-4">
          {loading ? <Loading /> : filteredGroups.length === 0 ? (
            <div className="glass-panel p-10 text-center text-white/45">No groups yet.</div>
          ) : filteredGroups.map(group => (
            <div key={group.id} className="card">
              <div className="flex justify-between items-start gap-3 mb-4">
                <div>
                  <h3 className="font-head text-lg font-bold">{group.name}</h3>
                  <div className="text-sm text-white/45">{group.description || 'No description'}</div>
                  <div className="text-xs text-white/30 mt-1">{group.member_count} students</div>
                </div>
                <div className="flex gap-2">
                  {group.invite_token ? (
                    <>
                      <CopyButton value={`${window.location.origin}/groups/join/${group.invite_token}`} label="Copy link" />
                      <button className="btn btn-ghost btn-sm" onClick={() => revokeInvite(group)}>Revoke</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => getInvite(group)}>Invite Link</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => renameGroup(group)}>Rename</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteGroup(group)}>Delete</button>
                </div>
              </div>

              {inviteLinks[group.id] && (
                <div className="mt-4 text-sm text-white/45 break-all">
                  Invite link: <span className="text-white/80">{inviteLinks[group.id]}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-4">
                <Select value={String(memberDraft[group.id] || '')} onChange={value => setMemberDraft(prev => ({ ...prev, [group.id]: value }))}
                  placeholder="Add student" options={[{ value: '', label: 'Add student' }, ...users.map(user => ({ value: String(user.id), label: `${user.username}${user.name ? ` · ${user.name}` : ''}` }))]} />
                <button className="btn btn-primary" onClick={() => addMember(group.id)}>Add</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.members.length === 0 ? (
                  <span className="text-sm text-white/40">No students in this group yet.</span>
                ) : group.members.map(member => (
                  <span key={member.student_id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm">
                    <span>{member.username}</span>
                    <button className="text-white/35 hover:text-rose-300" onClick={() => removeMember(group.id, member.student_id)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
