import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const SURFACE = 'tires'

function formatRetryAfter(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.ceil(ms / 60000)
  if (minutes <= 1) return 'less than a minute'
  return `${minutes} minutes`
}

/**
 * Client-side state + dispatch for the sales advisor drawer.
 *
 * @param {{ buildContext: () => object, callable?: unknown, surface?: string }} params
 */
export function useSalesAdvisorChat({ buildContext, callable, surface = SURFACE }) {
  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)

  // Mirror of `messages` for the in-flight `send` call so we can append to
  // the latest array even if React hasn't flushed the user-message setState
  // before we hand the payload to the callable. Prevents the stale-closure
  // race where two concurrent sends overwrite each other's user message.
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Concurrency guard: a second send while one is in-flight is dropped.
  // Send button is also disabled while pending; this guard covers
  // programmatic / test paths that bypass the button.
  const inFlightRef = useRef(false)

  const fn = useMemo(() => {
    if (callable) return callable
    return httpsCallable(functions, 'salesAdvisorChat')
  }, [callable])

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])
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
      const result = await fn({
        surface,
        messages: next,
        context: buildContext(),
      })
      const reply = String(result?.data?.reply || '').trim()
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: reply || '(empty reply from advisor)' },
      ])
    } catch (err) {
      const code = err?.code || ''
      const retryAfterText = formatRetryAfter(err?.details?.retryAfterMs)
      const friendly = code === 'resource-exhausted'
        ? `Advisor failed: rate limit reached. Try again in ${retryAfterText || 'a few minutes'}.`
        : code === 'permission-denied'
          ? 'Advisor failed: admin role required.'
          : `Advisor failed: ${err?.message || 'unknown error'}`
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: friendly, error: true },
      ])
    } finally {
      setPending(false)
      inFlightRef.current = false
    }
  }, [fn, buildContext, surface])

  return { isOpen, open, close, toggle, messages, pending, send, clear }
}
