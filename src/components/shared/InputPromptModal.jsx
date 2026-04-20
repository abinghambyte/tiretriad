import { useEffect, useRef, useState } from 'react'

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
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
      >
        <h2 className="mb-3 text-base font-semibold text-zinc-100">{title}</h2>
        {label ? <label className="mb-1 block text-xs text-zinc-400">{label}</label> : null}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-600 focus:outline-none"
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
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
