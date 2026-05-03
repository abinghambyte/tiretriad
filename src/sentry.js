import * as Sentry from '@sentry/react'

/**
 * Initialize Sentry for production error tracking.
 *
 * Gated on `import.meta.env.PROD === true`. In dev builds Vite replaces this
 * with literal `false`, so the entire Sentry initialization branch
 * dead-code-eliminates from the dev bundle and never affects the dev server,
 * Playwright tests, or local debugging.
 *
 * In production:
 * - DSN is read from `VITE_SENTRY_DSN` (Vercel project env var)
 * - If DSN is missing, logs a warning and disables tracking, safer than
 *   throwing because production crashes shouldn't be caused by missing telemetry
 * - Performance traces sampled at 10% to stay within free-tier budget
 */
export function initSentry() {
  if (!import.meta.env.PROD) return
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.warn('Sentry DSN missing in production, error tracking disabled')
    return
  }
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE_SHA || 'unknown',
    // Filter known-benign noise so real issues stand out in the weekly digest.
    // AbortError fires when a fetch is in-flight and React unmounts the
    // component (useEffect cleanup, navigation, Strict Mode double-render).
    // It is not a bug; it is the abort signal working correctly.
    beforeSend(event, hint) {
      const err = hint?.originalException
      const name = err?.name || ''
      const message = String(err?.message || event?.message || '')
      if (name === 'AbortError') return null
      if (message.includes('The user aborted a request')) return null
      return event
    },
  })
}

export { Sentry }
