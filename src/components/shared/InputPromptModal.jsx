import { useEffect, useId, useRef, useState } from 'react'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_BASE } from '../ui/modalChrome.js'

/**
 * Small single-field text-input modal. Drop-in replacement for
 * `window.prompt()` that participates in the portal's dark theme + focus
 * management + Escape-to-close conventions from other modals.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string} props.title
 * @param {string} [props.label]
 * @param {string} [props.placeholder]
 * @param {string} [props.defaultValue]
 * @param {string} [props.submitLabel]
 * @param {string} [props.cancelLabel]
 * @param {number} [props.maxLength]
 * @param {boolean} [props.allowEmpty]  accept empty input as a valid submit (default: false)
 * @param {(value: string) => void} props.onSubmit  called with the trimmed value on submit
 * @param {() => void} props.onClose  called on cancel, Escape, or after submit
 */
export function InputPromptModal({
  isOpen,
  title,
  label,
  placeholder = '',
  defaultValue = '',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  maxLength = 200,
  allowEmpty = false,
  onSubmit,
  onClose,
}) {
  // `key` on the modal below remounts this component on each open so we can
  // safely seed state from `defaultValue` without violating the
  // "no setState in effect" rule.
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!allowEmpty && !trimmed) return
    onSubmit?.(trimmed)
    onClose?.()
  }

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={`${MODAL_CENTER_PANEL_BASE} max-w-sm p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </div>
        {label ? <label className="mb-1 mt-3 block text-xs text-zinc-400">{label}</label> : null}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none ${label ? '' : 'mt-3'}`}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!allowEmpty && !value.trim()}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
