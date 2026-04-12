/**
 * Attach as `onKeyDown` on a `<form>`: submits when user presses Cmd+Enter (macOS) or Ctrl+Enter (Windows).
 * @param {React.KeyboardEvent<HTMLFormElement>} e
 */
export function cmdEnterSubmitKeyDown(e) {
  if (e.key !== 'Enter' || (!e.metaKey && !e.ctrlKey)) return
  const form = e.currentTarget
  if (!(form instanceof HTMLFormElement)) return
  e.preventDefault()
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit()
  } else {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }
}

/** For forms that use `onSubmit={(e) => e.preventDefault()}` and submit via a separate action. */
export function cmdEnterInvokeKeyDown(fn) {
  return (e) => {
    if (e.key !== 'Enter' || (!e.metaKey && !e.ctrlKey)) return
    e.preventDefault()
    fn(e)
  }
}
