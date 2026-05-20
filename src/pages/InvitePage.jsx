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
import { BrandBolt } from '../components/ui/BrandBolt.jsx'
import { formatPhoneInputForDisplay, normalizePhoneToE164 } from '../utils/formatPhone'

const PASSWORD_MIN_LENGTH = 8

const resolveInviteFn = httpsCallable(functions, 'resolveInvite')
const getInviteGreetingFn = httpsCallable(functions, 'getInviteGreeting')
const sendInviteRegistrationCodeFn = httpsCallable(functions, 'sendInviteRegistrationCode')
const completeInviteRegistrationFn = httpsCallable(functions, 'completeInviteRegistration')

/**
 * Reason-specific copy for the invalid-invite page. The recipient
 * needs to know what to do next — a randomly-rotated cryptic phrase
 * was indistinguishable from a phishing landing on a managed corporate
 * device. Keys mirror the `reason` values returned by `resolveInvite`
 * in functions/inviteFlow.js.
 */
const INVALID_COPY = {
  'not-found': {
    headline: 'We could not find this invite',
    body: 'The link does not match any registration we have on file. It may have been mistyped, or the invite may have been revoked.',
    next: 'Ask the person who invited you to send a fresh link.',
  },
  expired: {
    headline: 'This invite has expired',
    body: 'Tire Triad registration links are good for 48 hours so they cannot be reused later. No account was created.',
    next: 'Ask the person who invited you to issue a new link.',
  },
  used: {
    headline: 'This invite was already used',
    body: 'Registration links are single-use. If you finished registering, sign in with the email and password you set.',
    next: 'Open app.tiretriad.com and sign in. If you did not register, ask for a fresh link.',
  },
  accepted: {
    headline: 'You are already registered',
    body: 'This invite belongs to an account that has already finished setup.',
    next: 'Open app.tiretriad.com and sign in.',
  },
  revoked: {
    headline: 'This invite has been revoked',
    body: 'The link was cancelled before it could be used. No account was created.',
    next: 'Ask the person who invited you to issue a new link.',
  },
  'no-user': {
    headline: 'This invite is no longer linked to an account',
    body: 'The user record this invite pointed to is gone. This is unusual; let us know it happened.',
    next: 'Reply to the invite email or ask the person who invited you to start over.',
  },
  inactive: {
    headline: 'This invite is not active',
    body: 'We could not load this registration link. It may have expired, been revoked, or already been used.',
    next: 'Ask the person who invited you to send a fresh link.',
  },
}

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
  const [invalidReason, setInvalidReason] = useState('')
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
  const [regError, setRegError] = useState('')
  const [regBusy, setRegBusy] = useState(false)
  const [codeSentNote, setCodeSentNote] = useState('')

  useEffect(() => {
    if (!token) {
      setInvalidReason('not-found')
      setPhase('invalid')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await resolveInviteFn({ token })
        if (cancelled) return
        if (!data?.valid) {
          setInvalidReason(String(data?.reason || 'inactive'))
          setPhase('invalid')
          return
        }
        setInvite(data)
        setRegEmail(String(data.email || ''))
        setRegFirst(String(data.firstName || ''))
        setRegLast(String(data.lastName || ''))
        setPhase('intro')
      } catch (e) {
        if (!cancelled) {
          // Surface the real error in the console so we can correlate
          // the recipient's "the link is broken" with the actual code.
          console.error('resolveInvite failed', e)
          setInvalidReason('inactive')
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
    () => ['Email', 'Code', 'Name', 'Phone', 'Password'],
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
      await completeInviteRegistrationFn({
        token,
        email: regEmail.trim().toLowerCase(),
        code: regCode.trim(),
        firstName: regFirst.trim(),
        lastName: regLast.trim(),
        phone: normalizePhoneToE164(regPhone) || regPhone.trim(),
        password: regPassword,
      })
      await signInWithEmailAndPassword(auth, regEmail.trim(), regPassword)
      await callRecordLogin()
      // Slack step dropped: jobs / updates / schedules now live in the
      // portal and SMS alerts. Drop the recipient straight into the
      // handshake → dashboard flow instead.
      navigate('/handshake', { replace: true })
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
    const copy = INVALID_COPY[invalidReason] || INVALID_COPY.inactive
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 py-12 text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <BrandBolt size={48} tone="solid" aria-label="Tire Triad" />
          <p className="text-[11px] tracking-[0.3em] text-zinc-500">TIRE TRIAD</p>
        </div>
        <div className="max-w-sm">
          <h1 className="mb-3 text-lg font-semibold text-zinc-100">{copy.headline}</h1>
          <p className="mb-5 text-sm leading-relaxed text-zinc-400">{copy.body}</p>
          <p className="text-sm font-medium text-amber-300">{copy.next}</p>
        </div>
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
          <div className="mb-2 flex flex-col items-center gap-6">
            <BrandBolt size={56} tone="glow" aria-label="Tire Triad" />
            <p className="text-xs tracking-[0.3em] text-zinc-400">TIRE&nbsp;TRIAD</p>
          </div>
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
                  inputMode="tel"
                  required
                  autoComplete="tel"
                  placeholder="+1 (555) 123-4567"
                  value={formatPhoneInputForDisplay(regPhone)}
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
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  aria-describedby="invite-reg-password-hint"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm outline-none ring-zinc-700 focus:ring-2"
                />
                <p
                  id="invite-reg-password-hint"
                  className={`mt-2 text-[11px] ${
                    regPassword.length === 0
                      ? 'text-zinc-500'
                      : regPassword.length >= PASSWORD_MIN_LENGTH
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                  }`}
                >
                  {regPassword.length === 0
                    ? `Minimum ${PASSWORD_MIN_LENGTH} characters. No other requirements.`
                    : regPassword.length >= PASSWORD_MIN_LENGTH
                      ? `Looks good (${regPassword.length} characters).`
                      : `${PASSWORD_MIN_LENGTH - regPassword.length} more character${
                          PASSWORD_MIN_LENGTH - regPassword.length === 1 ? '' : 's'
                        } to go.`}
                </p>
              </>
            ) : null}
            <button
              type="submit"
              disabled={regBusy}
              className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-medium text-black transition hover:bg-white disabled:opacity-50"
            >
              {regBusy ? 'Working…' : regStep === 4 ? 'Finish' : 'Continue'}
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
              {/* Doorway: the white stripe opens like a slit between two
                  black panels, then once the door rotates away (step 1)
                  it fades to transparent so the page settles to pure
                  black with the brand mark glowing behind the content,
                  instead of leaving a white band that blends with the
                  Continue link text. */}
              <Motion.div
                className="absolute inset-0 bg-white"
                initial={{ clipPath: 'inset(48% 49% 48% 49%)', opacity: 1 }}
                animate={
                  fxStep >= 2
                    ? { clipPath: 'inset(0% 44% 0% 44%)', opacity: 0 }
                    : { clipPath: 'inset(0% 44% 0% 44%)', opacity: 1 }
                }
                transition={
                  fxStep >= 2
                    ? { duration: 0.6, ease: 'easeOut' }
                    : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
                }
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
              {/* Brand mark watermark — large, faint, fades in alongside
                  the content so the screen reads as Tire Triad without
                  competing with the foreground text. pointer-events-none
                  is inherited from the wrapper. */}
              {fxStep >= 2 ? (
                <Motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.18 }}
                  transition={{ delay: 0.2, duration: 0.9, ease: 'easeOut' }}
                  aria-hidden
                >
                  <BrandBolt size={420} tone="solid" className="max-w-[80vw]" />
                </Motion.div>
              ) : null}
            </div>

            {fxStep >= 2 ? (
              <Motion.div
                className="relative z-10 flex max-w-md flex-col items-center px-8 text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.55 }}
              >
                <div className="mb-10 flex flex-col items-center gap-4">
                  <Motion.h1
                    className="text-3xl font-extralight tracking-[0.45em] text-zinc-100 sm:text-4xl"
                    initial={{ opacity: 0, letterSpacing: '0.2em' }}
                    animate={{ opacity: 1, letterSpacing: '0.45em' }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}
                  >
                    TIRE TRIAD
                  </Motion.h1>
                </div>
                <p
                  className="mb-12 min-h-[3rem] text-sm font-light leading-relaxed text-zinc-200"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}
                >
                  {greeting || '…'}
                </p>
                <button
                  type="button"
                  onClick={() => setPhase('register')}
                  className="rounded-full border border-zinc-700 bg-zinc-950/70 px-6 py-3 text-xs tracking-[0.25em] text-zinc-100 backdrop-blur-sm transition hover:border-amber-500/60 hover:bg-zinc-900/80 hover:text-amber-200"
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
