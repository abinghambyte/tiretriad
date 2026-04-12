import { createContext, useContext } from 'react'

/** @type {import('react').Context<{ toast: (msg: string, variant?: 'info'|'success'|'error') => void } | null>} */
export const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
