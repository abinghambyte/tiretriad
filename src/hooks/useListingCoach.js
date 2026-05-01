import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

function formatRetryAfter(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.ceil(ms / 60000)
  if (minutes <= 1) return 'less than a minute'
  return `${minutes} minutes`
}

/**
 * Client-side state + dispatch for the listing coach drawer.
 *
 * Mirrors useSalesAdvisorChat with an audience selector added. Sends
 * { messages, audience } to the `listingCoach` callable (note: the
 * `listingAdvisor` name belongs to the existing Gemini generator).
 *
 * @param {{ callable?: unknown }} [params]
 */
export function useListingCoach({ callable } = {}) {
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)
  const [audience, setAudience] = useState(null)

  // Mirror of `messages` for the in-flight `send` call so we can append to
  // the latest array even if React hasn't flushed the user-message setState
  // before we hand the payload to the callable.
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Concurrency guard: a second send while one is in-flight is dropped.
  const inFlightRef = useRef(false)

  const fn = useMemo(() => {
    if (callable) return callable
    return httpsCallable(functions, 'listingCoach')
  }, [callable])

  const clear = useCallback(() => setMessages([]), [])

  const send = useCallback(async (text) => {
    const userText = String(text || '').trim()
    if (!userText) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    const userMsg = { role: 'user', content: userText }
    const next = [...messagesRef.current, userMsg]
    messagesRef.current = next
    setMessages(next)
    setPending(true)
    try {
      const result = await fn({ messages: next, audience })
      const reply = String(result?.data?.reply || '').trim()
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: reply || '(empty reply from coach)' },
      ])
    } catch (err) {
      const code = err?.code || ''
      const retryAfterText = formatRetryAfter(err?.details?.retryAfterMs)
      const friendly = code === 'resource-exhausted'
        ? `Coach failed: rate limit reached. Try again in ${retryAfterText || 'a few minutes'}.`
        : code === 'permission-denied'
          ? 'Coach failed: admin role required.'
          : `Coach failed: ${err?.message || 'unknown error'}`
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: friendly, error: true },
      ])
    } finally {
      setPending(false)
      inFlightRef.current = false
    }
  }, [fn, audience])

  return { messages, pending, audience, setAudience, send, clear }
}
