
import { useEffect, useRef, useState } from 'react'

const NETWORK_WARN_TYPES = ['slow-2g', '2g'] // types we warn about

// ─── tiny status indicator ────────────────────────────────────────────────────
function StatusRow({ icon, label, status, detail }) {
  const colours = {
    idle:    'text-white/30',
    pending: 'text-amber-400',
    ok:      'text-emerald-400',
    warn:    'text-amber-400',
    error:   'text-rose-400',
  }
  const icons = { idle: '○', pending: '◌', ok: '✓', warn: '⚠', error: '✕' }
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="text-xl w-6 text-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">{label}</span>
          <span className={`text-xs font-semibold ${colours[status] ?? colours.idle}`}>
            {icons[status] ?? '○'} {status.toUpperCase()}
          </span>
        </div>
        {detail && <p className="text-xs text-white/35 mt-0.5">{detail}</p>}
      </div>
    </div>
  )
}

export default function QuizPermissions({ onReady, onTabSwitch, requireCamera = false }) {
  // ── state for each check ──────────────────────────────────────────────────
  const [fsStatus,  setFsStatus]  = useState('idle')   // fullscreen
  const [camStatus, setCamStatus] = useState('idle')   // camera
  const [netStatus, setNetStatus] = useState('idle')   // network
  const [fsError,   setFsError]   = useState('')
  const [camError,  setCamError]  = useState('')
  const [netDetail, setNetDetail] = useState('')
  const [checking,  setChecking]  = useState(false)
  const streamRef = useRef(null)

  // ── network check (synchronous, done immediately) ─────────────────────────
  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!conn) {
      setNetStatus('warn')
      setNetDetail('Network API unavailable — cannot check speed')
      return
    }
    const type = conn.effectiveType
    if (NETWORK_WARN_TYPES.includes(type)) {
      setNetStatus('warn')
      setNetDetail(`Slow connection detected (${type}). Quiz may lag.`)
    } else {
      setNetStatus('ok')
      setNetDetail(`${type} — looks good`)
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) {
        setFsStatus('ok')
        setFsError('')
      } else if (fsStatus === 'ok') {
        // User pressed Esc — mark as error so they have to re-enter
        setFsStatus('error')
        setFsError('You exited fullscreen. Please re-enter to continue.')
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [fsStatus])

  // ── cleanup camera stream on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── request fullscreen ────────────────────────────────────────────────────
  const requestFullscreen = async () => {
    setFsStatus('pending')
    setFsError('')
    try {
      await document.documentElement.requestFullscreen()
      // onFsChange listener above will set status to 'ok'
    } catch (e) {
      setFsStatus('error')
      setFsError(e?.message || 'Fullscreen denied. Please allow it to continue.')
    }
  }

  // ── request camera ────────────────────────────────────────────────────────
  const requestCamera = async () => {
    setCamStatus('pending')
    setCamError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      setCamStatus('ok')
    } catch (e) {
      const msg = e?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser settings.'
        : e?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : e?.message || 'Camera access failed.'
      setCamStatus(requireCamera ? 'error' : 'warn')
      setCamError(msg)
    }
  }

  // ── run all checks ────────────────────────────────────────────────────────
  const runChecks = async () => {
    setChecking(true)
    await requestFullscreen()
    await requestCamera()
    setChecking(false)
  }

  // ── derive whether we can proceed ─────────────────────────────────────────
  // Fullscreen is required. Camera is required only if requireCamera=true,
  // otherwise a warn is acceptable. Network warn is always acceptable.
  const fsOk  = fsStatus === 'ok'
  const camOk = camStatus === 'ok' || (!requireCamera && camStatus === 'warn')
  const canProceed = fsOk && camOk

  return (
    <div className="page-wrap max-w-[480px]">
      <div className="glass-panel p-8 fade-up">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🛡️</div>
          <h2 className="font-head font-bold text-xl text-white/90 mb-1">Before you begin</h2>
          <p className="text-sm text-white/45">
            This quiz requires fullscreen mode and monitors for integrity violations.
            Grant the permissions below to start.
          </p>
        </div>

        <div className="divide-y divide-white/[0.06] mb-6">
          <StatusRow
            icon="⛶"
            label="Fullscreen"
            status={fsStatus}
            detail={fsError || (fsStatus === 'ok' ? 'Active — do not press Esc during the quiz' : 'Required to prevent switching windows')}
          />
          <StatusRow
            icon="📷"
            label="Camera"
            status={camStatus}
            detail={camError || (camStatus === 'ok' ? 'Camera active' : requireCamera ? 'Required for proctoring' : 'Optional — quiz continues without it')}
          />
          <StatusRow
            icon="📶"
            label="Network"
            status={netStatus}
            detail={netDetail || 'Checking connection speed…'}
          />
        </div>

        {/* Warnings / errors */}
        {fsStatus === 'error' && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300 mb-4">
            ⚠️ {fsError}
          </div>
        )}
        {camStatus === 'warn' && camError && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300 mb-4">
            ⚠️ {camError}
          </div>
        )}
        {netStatus === 'warn' && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300 mb-4">
            ⚠️ {netDetail}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Main CTA */}
          {!canProceed ? (
            <button
              className="btn btn-primary w-full"
              onClick={runChecks}
              disabled={checking || fsStatus === 'pending' || camStatus === 'pending'}
            >
              {checking ? '⏳ Requesting permissions…' : fsStatus === 'idle' ? '🔒 Grant Permissions & Enter Fullscreen' : '🔄 Retry Permissions'}
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={onReady}>
              ✅ Start Quiz
            </button>
          )}

          {/* Allow skipping camera warn if not required */}
          {!requireCamera && camStatus === 'warn' && fsOk && (
            <button className="btn btn-ghost w-full text-sm" onClick={onReady}>
              Continue without camera →
            </button>
          )}
        </div>

        <p className="text-[0.7rem] text-white/25 text-center mt-5 leading-relaxed">
          Tab switches are monitored throughout the quiz and may be flagged as integrity violations.
        </p>
      </div>
    </div>
  )
}
