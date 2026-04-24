import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { auth, functions } from '../firebase/config'
import {
  MODAL_CENTER_BACKDROP_TOP,
  MODAL_CENTER_PANEL_BASE,
} from '../components/ui/modalChrome.js'
import { callRecordLogin } from '../utils/callRecordLogin'

const resolveInviteFn = httpsCallable(functions, 'resolveInvite')
const getInviteGreetingFn = httpsCallable(functions, 'getInviteGreeting')
const sendInviteRegistrationCodeFn = httpsCallable(functions, 'sendInviteRegistrationCode')
const completeInviteRegistrationFn = httpsCallable(functions, 'completeInviteRegistration')

const INVALID_PHRASES = [
  'Nothing here.',
  'Not available.',
  'No path that way.',
  'Quiet on this line.',
  'The door stays shut.',
]

function playInviteTone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 587.33
    gain.gain.value = 0.06
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    const t = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.stop(t + 0.2)
    setTimeout(() => ctx.close().catch(() => {}), 400)
  } catch {
    /* ignore */
  }
}

export function InvitePage() {
  const { token: rawToken } = useParams()
  const token = String(rawToken || '').trim()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('loading')
  const [invalidPhrase, setInvalidPhrase] = useState('')
  const [invite, setInvite] = useState(null)
  const [greeting, setGreeting] = useState('')
  const [fxStep, setFxStep] = useState(0)

  const [regStep, setRegStep] = useState(0)
  const [regEmail, setRegEmail] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regFirst, setRegFirst] = useState('')
  const [regLast, setRegLast] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [slackInviteUrl, setSlackInviteUrl] = useState('')
  const [slackJoined, setSlackJoined] = useState(false)
  const [regError, setRegError] = useState('')
  const [regBusy, setRegBusy] = useState(false)
  const [codeSentNote, setCodeSentNote] = useState('')

  useEffect(() => {
    if (!token) {
      setInvalidPhrase(INVALID_PHRASES[0])
      setPhase('invalid')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await resolveInviteFn({ token })
        if (cancelled) return
        if (!data?.valid) {
          setInvalidPhrase(INVALID_PHRASES[Math.floor(Math.random() * INVALID_PHRASES.length)])
          setPhase('invalid')
          return
        }
        setInvite(data)
        setRegEmail(String(data.email || ''))
        setRegFirst(String(data.firstName || ''))
        setRegLast(String(data.lastName || ''))
        setPhase('intro')
      } catch {
        if (!cancelled) {
          setInvalidPhrase(INVALID_PHRASES[Math.floor(Math.random() * INVALID_PHRASES.length)])
          setPhase('invalid')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (phase !== 'intro') return undefined
    let cancelled = false
    ;(async () => {
      await new Promise((r) => setTimeout(r, 120))
      if (cancelled) return
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!prefersReducedMotion) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([28, 36, 28])
        }
        playInviteTone()
      }
      await new Promise((r) => setTimeout(r, 520))
      if (!cancelled) {
        setPhase('experience')
        setFxStep(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase])

  const loadGreeting = useCallback(async () => {
    if (!token || !invite) return
    try {
      const { data } = await getInviteGreetingFn({
        token,
        firstName: invite.firstName,
        crewTag: invite.crewTag,
      })
      setGreeting(String(data?.greeting || `${invite.firstName}. We've been expecting this.`))
    } catch {
      setGreeting(`${invite.firstName || 'There'}. We've been expecting this.`)
    }
  }, [token, invite])

  useEffect(() => {
    if (phase !== 'experience' || fxStep < 2) return
    void loadGreeting()
  }, [phase, fxStep, loadGreeting])

  useEffect(() => {
    if (phase !== 'experience' || fxStep !== 1) return undefined
    const t = setTimeout(() => setFxStep((s) => Math.max(s, 2)), 1200)
    return () => clearTimeout(t)
  }, [phase, fxStep])

  useEffect(() => {
    if (phase !== 'register') return undefined
    function onKey(e) {
      if (e.key === 'Escape') setPhase('experience')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase])

  const regTitles = useMemo(
    () => ['Email', 'Code', 'Name', 'Phone', 'Password', 'Slack'],
    [],
  )

  async function sendCode() {
    setRegError('')
    setCodeSentNote('')
    setRegBusy(true)
    try {
      const { data } = await sendInviteRegistrationCodeFn({
        token,
        email: regEmail.trim().toLowerCase(),
      })
      if (data?.sent === false) {
        setCodeSentNote(
          'Email could not be sent (Resend not configured). Use the code from your administrator or server logs in development.',
        )
      }
      setRegStep(1)
    } catch (e) {
      setRegError(e?.message || 'Could not send code.')
    } finally {
      setRegBusy(false)
    }
  }

  async function completeRegistration() {
    setRegError('')
    setRegBusy(true)
    try {
      const { data } = await completeInviteRegistrationFn({
        token,
        email: regEmail.trim().toLowerCase(),
        code: regCode.trim(),
        firstName: regFirst.trim(),
        lastName: regLast.trim(),
        phone: regPhone.trim(),
        password: regPassword,
      })
      await signInWithEmailAndPassword(auth, regEmail.trim(), regPassword)
      await callRecordLogin()
      setSlackInviteUrl(String(data?.slackInviteUrl || '').trim())
      setSlackJoined(false)
      setRegStep(5)
    } catch (e) {
      setRegError(e?.message || 'Registration failed.')
    } finally {
      setRegBusy(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        <p className="animate-pulse text-sm tracking-wide">Checking…</p>
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8 text-center">
        <p className="text-sm font-light tracking-wide text-zinc-400">{invalidPhrase}</p>
      </div>
    )
  }

  if (phase === 'intro') {
    return <div className="min-h-screen bg-black" aria-hidden />
  }

  if (phase === 'register') {
    return (
      <div
        className={`${MODAL_CENTER_BACKDROP_TOP} !bg-black`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-reg-title"
      >
        <div
          className={`${MODAL_CENTER_PANEL_BASE} max-w-sm border-zinc-800 bg-black p-6 text-zinc-100 sm:p-8`}
        >
          <p className="mb-2 text-xs tracking-[0.3em] text-zinc-400">SKEDADDLE</p>
          <p id="invite-reg-title" className="mb-8 text-sm text-zinc-400">
            Step {regStep + 1} of {regTitles.length}. {regTitles[regStep]}
          </p>
          <form
            className="w-full space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setRegError('')
              if (regStep === 0) void sendCode()
              else if (regStep === 1) {
                if (regCode.trim().length !== 6) {
                  setRegError('Enter the 6-digit code.')
                  return
                }
                setRegStep(2)
              } else if (regStep === 2) {
                if (!regFirst.trim() || !regLast.trim()) {
                  setRegError('First and last name are required.')
                  return
                }
                setRegStep(3)
              } else if (regStep === 3) {
                if (regPhone.trim().length < 7) {
                  setRegError('Enter a valid phone number.')
                  return
                }
                setRegStep(4)
              } else if (regStep === 4) {
                if (regPassword.length < 8) {
                  setRegError('Password must be at least 8 characters.')
                  return
                }
                void completeRegistration()
              } else if (regStep === 5) {
                navigate('/handshake', { replace: true })
              }
            }}
          >
            {regError ? (
              <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-center text-sm text-red-200">
                {regError}
              </p>
            ) : null}
            {codeSentNote && regStep === 1 ? (
              <p className="rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-center text-xs text-amber-100/90">
                {codeSentNote}
              </p>
            ) : null}

            {regStep === 0 ? (
              <>
                <label htmlFor="invite-reg-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="invite-reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
              </>
            ) : null}
            {regStep === 1 ? (
              <>
                <label htmlFor="invite-reg-code" className="sr-only">
                  6-digit verification code
                </label>
                <input
                  id="invite-reg-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="6-digit code"
                  required
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none ring-zinc-700 focus:ring-2"
                />
              </>
            ) : null}
            {regStep === 2 ? (
              <div className="space-y-3">
                <label htmlFor="invite-reg-first" className="sr-only">
                  First name
                </label>
                <input
                  id="invite-reg-first"
                  type="text"
                  required
                  placeholder="First name"
                  value={regFirst}
                  onChange={(e) => setRegFirst(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
                <label htmlFor="invite-reg-last" className="sr-only">
                  Last name
                </label>
                <input
                  id="invite-reg-last"
                  type="text"
                  required
                  placeholder="Last name"
                  value={regLast}
                  onChange={(e) => setRegLast(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
              </div>
            ) : null}
            {regStep === 3 ? (
              <>
                <label htmlFor="invite-reg-phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="invite-reg-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="Phone number"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
              </>
            ) : null}
            {regStep === 4 ? (
              <>
                <label htmlFor="invite-reg-password" className="sr-only">
                  Password
                </label>
                <input
                  id="invite-reg-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
              </>
            ) : null}
            {regStep === 5 ? (
              <div className="space-y-4 text-center">
                <p className="text-sm leading-relaxed text-zinc-400">
                  Last step. Join the crew on Slack. That&apos;s where jobs, updates, and schedules live.
                </p>
                {slackInviteUrl ? (
                  <a
                    href={slackInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSlackJoined(true)}
                    className="block w-full rounded-xl bg-[#4A154B] py-3 text-sm font-medium text-white transition hover:bg-[#611f64]"
                  >
                    Join Slack workspace
                  </a>
                ) : (
                  <p className="text-xs text-zinc-600">
                    Ask Alex for the Slack invite link. You can join after setup.
                  </p>
                )}
                {slackJoined ? (
                  <p className="text-xs text-zinc-400">✓ Nice. Hit &quot;I&apos;m in&quot; to open the portal.</p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={regBusy}
              className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-medium text-black transition hover:bg-white disabled:opacity-50"
            >
              {regBusy
                ? 'Working…'
                : regStep === 4
                  ? 'Finish'
                  : regStep === 5
                    ? "I'm in"
                    : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
      <AnimatePresence>
        {phase === 'experience' ? (
          <Motion.div
            key="fx"
            className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="pointer-events-none absolute inset-0" style={{ perspective: '1200px' }}>
              <Motion.div
                className="absolute inset-0 bg-white"
                initial={{ clipPath: 'inset(48% 49% 48% 49%)' }}
                animate={{ clipPath: 'inset(0% 44% 0% 44%)' }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                onAnimationComplete={() => setFxStep((s) => Math.max(s, 1))}
              />
              {fxStep >= 1 ? (
                <Motion.div
                  className="absolute inset-0 bg-black"
                  initial={{ rotateX: 0, y: 0, opacity: 1 }}
                  animate={{ rotateX: 58, y: '-42%', opacity: 0 }}
                  transition={{ duration: 0.85, ease: [0.45, 0, 0.55, 1] }}
                  style={{ transformOrigin: '50% 100%', transformStyle: 'preserve-3d' }}
                  onAnimationComplete={() => setFxStep((s) => Math.max(s, 2))}
                />
              ) : null}
            </div>

            {fxStep >= 2 ? (
              <Motion.div
                className="relative z-10 flex max-w-md flex-col items-center px-8 text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.55 }}
              >
                <Motion.h1
                  className="mb-10 text-3xl font-extralight tracking-[0.45em] sm:text-4xl"
                  initial={{ opacity: 0, letterSpacing: '0.2em' }}
                  animate={{ opacity: 1, letterSpacing: '0.45em' }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                >
                  SKEDADDLE
                </Motion.h1>
                <p className="mb-12 min-h-[3rem] text-sm font-light leading-relaxed text-zinc-400">
                  {greeting || '…'}
                </p>
                <button
                  type="button"
                  onClick={() => setPhase('register')}
                  className="text-xs tracking-[0.25em] text-zinc-400 underline-offset-4 transition hover:text-zinc-300 hover:underline"
                >
                  Continue
                </button>
              </Motion.div>
            ) : null}
          </Motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
