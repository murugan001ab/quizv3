import { useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Spinner } from '../components/Shared'

function ProfilePictureCard({ user, token, toast, updateUser }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  

  const pickFile = () => fileRef.current?.click()

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    setUploading(true)
    try {
      const updated = await api.uploadProfilePicture(token, file)
      updateUser(updated)
      toast('Profile picture updated!', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
      URL.revokeObjectURL(objectUrl)
      setPreview(null)
      e.target.value = ''
    }
  }

  const avatarSrc = preview || user?.profile_url

  return (
    <div className="glass-panel fade-up max-w-[480px] p-6">
      <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-4">
        Profile picture
      </div>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="relative w-[88px] h-[88px] rounded-full shrink-0 overflow-hidden bg-white/[0.04] border border-white/10 flex items-center justify-center">
          {avatarSrc ? (
            <img src={avatarSrc} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="font-head font-bold text-2xl text-white/40">
              {(user?.username || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Spinner sm />
            </div>
          )}
        </div>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={pickFile} disabled={uploading}>
            {user?.profile_url ? 'Change picture' : 'Upload picture'}
          </button>
          <div className="text-xs text-white/40 mt-2">
            JPEG, PNG, WEBP or GIF · up to 5MB
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </div>
  )
}

function ChangePasswordCard({ token, toast }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!currentPassword || !newPassword) return toast('Fill in all fields', 'error')
    if (newPassword.length < 6) return toast('New password must be at least 6 characters', 'error')
    if (newPassword !== confirmPassword) return toast("New passwords don't match", 'error')

    setSaving(true)
    try {
      await api.changePassword(token, { current_password: currentPassword, new_password: newPassword })
      toast('Password updated!', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-panel fade-up-1 max-w-[480px] p-6">
      <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-4">
        Change password
      </div>
      <div className="flex flex-col gap-4">
        <div className="input-group">
          <label className="input-label">Current password</label>
          <input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="input-group">
          <label className="input-label">New password</label>
          <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div className="input-group">
          <label className="input-label">Confirm new password</label>
          <input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
        </div>
        <button className="btn btn-primary w-full" onClick={submit} disabled={saving}>
          {saving ? <Spinner sm /> : 'Update password'}
        </button>
      </div>
    </div>
  )
}

export default function Account() {
  const { user, token, updateUser,logout } = useAuth()
  const toast = useToast()

  return (
    <div className="page-wrap">
      <div className="page-header hidden sm:block fade-up ">
        <h1 className="page-title">Account</h1>
        <p className="page-sub">Manage your profile picture and password</p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="glass-panel max-w-[480px] p-6">
          <div className="text-xs text-white/40 font-semibold tracking-wide uppercase mb-2">
            Signed in as
          </div>
          <div className="font-semibold">{user?.username}</div>
          <div className="text-sm text-white/40">{user?.email}</div>
        </div>

        <ProfilePictureCard user={user} token={token} toast={toast} updateUser={updateUser} />
        <ChangePasswordCard token={token} toast={toast} />

       <button
  onClick={logout}
  aria-label="Logout"
  className="
    max-w-[480px]
    px-5 py-3
    rounded-xl
    flex items-center justify-center gap-2
    bg-red-500/15
    border border-red-500/30
    text-red-400
    hover:bg-red-500/25
    hover:text-red-300
    active:scale-95
    transition-all
    duration-200
    font-medium
  "
>
  <span>↩</span>
  <span>Logout</span>
</button>
      </div>
    </div>
  )
}
