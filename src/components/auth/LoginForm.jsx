import { signInWithEmailAndPassword } from 'firebase/auth'
import { useState } from 'react'
import { auth } from '../../firebase/config'

export function LoginForm({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      if (onSuccess) await Promise.resolve(onSuccess())
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Check your email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sk-animate-fade-in w-full max-w-sm space-y-4"
    >
      {error ? (
        <p
          className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-center text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="space-y-1.5 text-left">
        <label htmlFor="email" className="text-xs font-medium text-zinc-500">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-600 transition focus:border-zinc-600 focus:ring-2"
        />
      </div>
      <div className="space-y-1.5 text-left">
        <label htmlFor="password" className="text-xs font-medium text-zinc-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-600 transition focus:border-zinc-600 focus:ring-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
