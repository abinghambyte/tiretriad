/**
 * Copy text to the clipboard without ever falling back to `window.prompt`.
 * Tries the modern async Clipboard API first; on permission failure or when
 * the page is not served over a secure context, uses a `document.execCommand`
 * textarea trick so the UI stays consistent (no blocking browser dialog).
 * @param {string} text
 * @returns {Promise<boolean>} true if the text was copied successfully
 */
export async function copyToClipboard(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
