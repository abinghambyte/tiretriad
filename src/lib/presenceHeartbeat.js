import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

/**
 * Presence heartbeat driver. Calls the `updatePresence` callable on an
 * interval while the page is visible, pauses while hidden, and resumes with
 * an immediate fire on visibility change. Single-flight — overlapping calls
 * are skipped. Server-side rate limit (45s) swallows occasional collisions
 * with the 60s interval silently; other errors are logged and the loop keeps
 * running.
 */

const DEFAULT_INTERVAL_MS = 60_000
const LOG_PREFIX = '[presence]'

const defaultCallable = httpsCallable(functions, 'updatePresence')

/**
 * @param {object} [options]
 * @param {number} [options.intervalMs] override the heartbeat period; default 60s
 * @param {(data: object) => Promise<unknown>} [options.callable] test seam
 * @param {Document} [options.doc] test seam (page visibility + listener wiring)
 * @returns {() => void} stop function
 */
export function startPresenceHeartbeat(options = {}) {
  const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs > 0
    ? options.intervalMs
    : DEFAULT_INTERVAL_MS
  const callable = options.callable || ((data) => defaultCallable(data))
  const doc = options.doc || (typeof document !== 'undefined' ? document : null)

  let stopped = false
  let inFlight = false
  let timerId = null

  function userAgent() {
    try {
      return typeof navigator !== 'undefined' && navigator.userAgent
        ? String(navigator.userAgent)
        : ''
    } catch {
      return ''
    }
  }

  function isVisible() {
    if (!doc) return true
    return doc.visibilityState !== 'hidden'
  }

  async function fire() {
    if (stopped || inFlight) return
    if (!isVisible()) return
    inFlight = true
    try {
      await callable({ userAgent: userAgent() })
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : null
      if (code === 'functions/resource-exhausted' || code === 'resource-exhausted') {
        // Expected: 45s server window collides with the 60s interval on drift.
      } else {
        console.warn(`${LOG_PREFIX} heartbeat failed`, err)
      }
    } finally {
      inFlight = false
    }
  }

  function startInterval() {
    if (timerId != null) return
    timerId = setInterval(fire, intervalMs)
  }

  function stopInterval() {
    if (timerId == null) return
    clearInterval(timerId)
    timerId = null
  }

  function onVisibilityChange() {
    if (stopped) return
    if (isVisible()) {
      // Resume with an immediate fire, then continue ticking.
      fire()
      startInterval()
    } else {
      stopInterval()
    }
  }

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onVisibilityChange)
  }

  // Kick off.
  if (isVisible()) {
    fire()
    startInterval()
  }

  return function stop() {
    if (stopped) return
    stopped = true
    stopInterval()
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

export const __test__ = {
  DEFAULT_INTERVAL_MS,
  LOG_PREFIX,
}
