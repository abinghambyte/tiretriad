import { doc, updateDoc } from 'firebase/firestore'
import { motion as Motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { useUserProfile } from '../hooks/useUserProfile'
import { BrandBolt } from '../components/ui/BrandBolt.jsx'

function handshakeSentence(firstName, crewTag, role) {
  const fn = (firstName || 'There').trim() || 'There'
  const tag = (crewTag || 'Spotter').trim() || 'Spotter'
  const r = String(role || 'viewer').toLowerCase()
  if (r === 'mechanic' || tag === 'Field') {
    return `${fn}. You're Field. Jobs come to you.`
  }
  if (r === 'supplier' || tag === 'Source') {
    return `${fn}. You're Source. The line runs through you.`
  }
  if (r === 'admin' || tag === 'Overwatch') {
    return `${fn}. You're Overwatch. You see the whole board.`
  }
  return `${fn}. You're ${tag}. Stay visible when it counts.`
}

export function HandshakePage() {
  const { profile, loading } = useUserProfile()
  const navigate = useNavigate()
  const [exiting, setExiting] = useState(false)
  const doneRef = useRef(false)
  const autoTimerRef = useRef(null)

  const finish = useCallback(async () => {
    if (doneRef.current || !auth.currentUser) return
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    doneRef.current = true
    setExiting(true)
    const uid = auth.currentUser.uid
    try {
      await updateDoc(doc(db, 'users', uid), { handshakeSeen: true })
    } catch (e) {
      console.error(e)
      doneRef.current = false
      setExiting(false)
      return
    }
    setTimeout(() => navigate('/dashboard', { replace: true }), 450)
  }, [navigate])

  useEffect(() => {
    if (loading || !profile || profile.handshakeSeen !== false) return undefined
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null
      void finish()
    }, 4000)
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }, [loading, profile, finish])

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <p className="animate-pulse text-sm">Loading…</p>
      </div>
    )
  }

  if (profile.handshakeSeen !== false) {
    return <Navigate to="/dashboard" replace />
  }

  const line = handshakeSentence(
    profile.firstName,
    profile.crewTag,
    profile.role,
  )

  return (
    <button
      type="button"
      onClick={() => void finish()}
      className="flex min-h-screen w-full cursor-default flex-col items-center justify-center bg-zinc-950 px-8 text-center text-zinc-100"
    >
      <Motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: exiting ? 0 : 1, y: exiting ? -6 : 0 }}
        transition={{ duration: 0.45 }}
        className="max-w-md space-y-6"
      >
        <div className="flex flex-col items-center gap-4">
          <BrandBolt size={56} tone="glow" aria-label="Skedaddle" />
          <p className="text-xs tracking-[0.35em] text-zinc-400">SKEDADDLE</p>
        </div>
        <p className="text-lg font-light leading-relaxed text-zinc-200 md:text-xl">{line}</p>
        <p className="text-xs text-zinc-600">Tap anywhere to continue</p>
      </Motion.div>
    </button>
  )
}
