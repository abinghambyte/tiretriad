import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from '../../context/ToastContext.jsx'

/**
 * @typedef {{ id: string, message: string, variant?: 'info'|'success'|'error' }} ToastItem
 */

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {ToastItem[]} */ ([]))

  const toast = useCallback((message, variant = 'info', durationMs = 3200) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const ms = Math.max(800, Math.min(20000, Number(durationMs) || 3200))
    setToasts((prev) => [...prev, { id, message: String(message), variant }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, ms)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[220] flex max-w-sm flex-col gap-2 p-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md',
              t.variant === 'error'
                ? 'border-red-900/60 bg-red-950/90 text-red-100'
                : t.variant === 'success'
                  ? 'border-emerald-900/50 bg-emerald-950/90 text-emerald-50'
                  : 'border-zinc-700 bg-zinc-900/95 text-zinc-100',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
