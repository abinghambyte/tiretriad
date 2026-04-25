import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal-rendered popover that escapes its parent stacking context.
 * Positions adjacent to its anchor element via getBoundingClientRect.
 * Flips upward when the anchor sits in the lower half of the viewport.
 *
 * @param {object} props
 * @param {import('react').ReactElement} props.anchor Trigger element. The popover
 *   wires onClick + ref to it.
 * @param {import('react').ReactNode} props.children Popover contents.
 * @param {boolean} [props.initialOpen=false] Test seam.
 * @param {() => void} [props.onClose] Fires when the popover closes.
 * @param {string} [props.label] aria-label for the dialog wrapper.
 * @param {'start' | 'end'} [props.align='end'] Right-edge alignment by default.
 */
export function Popover({ anchor, children, initialOpen = false, onClose, label, align = 'end' }) {
  const [open, setOpen] = useState(initialOpen)
  const [pos, setPos] = useState({ top: 0, left: 0, flip: 'down' })
  const anchorRef = useRef(/** @type {HTMLElement | null} */ (null))
  const popoverRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  // Reposition when opening
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
    const flip = rect.top + rect.height / 2 > viewportH / 2 ? 'up' : 'down'
    const top = flip === 'down' ? rect.bottom + 6 : rect.top - 6
    const right = window.innerWidth - rect.right
    const left = rect.left
    setPos({
      ...(flip === 'down' ? { top } : { bottom: viewportH - rect.top + 6 }),
      ...(align === 'end' ? { right } : { left }),
      flip,
    })
  }, [open, align])

  // Outside click + Escape
  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    function onPointer(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (anchorRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
    }
  }, [open, close])

  const handleAnchorClick = useCallback((e) => {
    if (isValidElement(anchor)) {
      anchor.props.onClick?.(e)
    }
    setOpen((prev) => !prev)
  }, [anchor])

  if (!isValidElement(anchor)) {
    throw new Error('Popover: anchor must be a single React element')
  }

  /* eslint-disable react-hooks/refs -- ref forwarding via cloneElement is intentional; the ref is only read inside effects */
  const triggered = cloneElement(anchor, {
    ref: anchorRef,
    onClick: handleAnchorClick,
    'aria-expanded': open,
    'aria-haspopup': 'menu',
    'aria-controls': open ? `popover-${id}` : undefined,
  })
  /* eslint-enable react-hooks/refs */

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  return (
    <>
      {triggered}
      {open && portalTarget
        ? createPortal(
            <div data-popover-portal>
              <div
                ref={popoverRef}
                id={`popover-${id}`}
                role="dialog"
                aria-label={label}
                data-popover-flip={pos.flip}
                className="fixed z-[120] min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
                style={pos}
              >
                {children}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}
