import { useCallback, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const SURFACE = 'tires'

/**
 * Client-side state + dispatch for the sales advisor drawer.
 *
 * @param {{ buildContext: () => object, callable?: unknown, surface?: string }} params
 */
export function useSalesAdvisorChat({ buildContext, callable, surface = SURFACE }) {
  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)

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
    const next = [...messages, { role: 'user', content: userText }]
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
      const friendly = code === 'resource-exhausted'
        ? 'Advisor failed: rate limit reached. Try again in a few minutes.'
        : code === 'permission-denied'
          ? 'Advisor failed: admin role required.'
          : `Advisor failed: ${err?.message || 'unknown error'}`
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: friendly, error: true },
      ])
    } finally {
      setPending(false)
    }
  }, [fn, messages, buildContext, surface])

  return { isOpen, open, close, toggle, messages, pending, send, clear }
}
