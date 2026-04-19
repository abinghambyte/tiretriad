import { useEffect, useMemo, useState } from 'react'
import { copyToClipboard } from '../../utils/copyToClipboard'
import { MODAL_CENTER_BACKDROP_TOP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'

/**
 * NFC writer modal. Opens after an NFC-delivery invite is created so the admin
 * can program a blank tag with the invite URL. Uses the browser Web NFC API
 * (`NDEFReader`) when available; otherwise falls back to a Copy URL flow with
 * a tooltip explaining that iOS and desktop need an external NFC writer app.
 *
 * Wrapped in {@link NfcWriterModal} below so a changed `inviteUrl` or `open`
 * remounts the inner body and resets transient write/copy state without the
 * anti-pattern of calling setState inside an effect.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   inviteUrl: string,
 *   firstName: string,
 * }} props
 */
function NfcWriterModalInner({ onClose, inviteUrl, firstName }) {
  const url = String(inviteUrl || '').trim()
  const name = String(firstName || '').trim()

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'NDEFReader' in window
  }, [])

  const [status, setStatus] = useState('idle') // idle | writing | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const [copyOk, setCopyOk] = useState(false)

  // Close on Escape for keyboard users.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function writeTag() {
    if (!supported || !url) return
    setStatus('writing')
    setErrorMsg('')
    try {
      const Reader = window.NDEFReader
      const ndef = new Reader()
      await ndef.write({ records: [{ recordType: 'url', data: url }] })
      setStatus('success')
    } catch (e) {
      setStatus('error')
      const raw = e?.message || String(e || 'Unknown error')
      // Surface the most common failure modes with clearer copy.
      if (/NotAllowedError|permission/i.test(raw)) {
        setErrorMsg('Permission denied. Allow NFC for this site and try again.')
      } else if (/NotSupportedError|not supported/i.test(raw)) {
        setErrorMsg('This browser does not support NFC writing.')
      } else {
        setErrorMsg(raw)
      }
    }
  }

  async function copyUrl() {
    const ok = await copyToClipboard(url)
    setCopyOk(ok)
    if (!ok) {
      // Leave the input visible so the user can select manually.
      window.setTimeout(() => setCopyOk(false), 1500)
      return
    }
    window.setTimeout(() => setCopyOk(false), 1500)
  }

  const writeDisabled = !supported || status === 'writing' || !url
  const writeTooltip = supported
    ? ''
    : 'NFC writing not supported in this browser. Use Copy URL and an NFC writer app instead.'

  return (
    <div
      className={MODAL_CENTER_BACKDROP_TOP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nfc-writer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-6 max-sm:p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="nfc-writer-title" className="text-lg font-semibold text-white">
              Program NFC tag for {name || 'new crew member'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Hold a blank NFC tag near your Android phone's back and click Write.
              On iOS or desktop, copy the URL below and write it with NFC Tools or
              NXP TagWriter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close NFC writer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            <span className="text-xl leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <button
              type="button"
              disabled={writeDisabled}
              title={writeTooltip || undefined}
              aria-disabled={writeDisabled}
              onClick={() => void writeTag()}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-amber-500/55 bg-amber-950/40 px-4 py-2.5 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/40 transition-colors hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'writing' ? 'Writing to NFC tag…' : 'Write to NFC tag'}
            </button>
            {!supported ? (
              <p className="mt-2 text-xs text-zinc-500">
                NFC writing is not supported in this browser. Use Copy URL and an
                NFC writer app instead.
              </p>
            ) : null}
            {status === 'success' ? (
              <p className="mt-2 text-sm font-medium text-emerald-200">
                Tag programmed. Tap another tag to write again.
              </p>
            ) : null}
            {status === 'error' ? (
              <p className="mt-2 text-sm text-amber-200">{errorMsg}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="nfc-writer-url"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Invite URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="nfc-writer-url"
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-h-[44px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-amber-600/45 focus:ring-2 focus:ring-amber-500/25 sm:text-sm"
              />
              <button
                type="button"
                onClick={() => void copyUrl()}
                className="min-h-[44px] rounded-lg border border-emerald-600/60 bg-emerald-900/35 px-4 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-900/55 sm:min-h-0"
              >
                {copyOk ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 sm:min-h-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Public wrapper for the NFC writer modal.
 *
 * Renders nothing when `open` is false. When `open` flips true (or the URL
 * changes), the inner body is keyed on those values so it remounts with fresh
 * state, so no `useEffect` + `setState` is needed to reset the write status.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   inviteUrl: string,
 *   firstName: string,
 * }} props
 */
export function NfcWriterModal({ open, onClose, inviteUrl, firstName }) {
  if (!open) return null
  return (
    <NfcWriterModalInner
      key={`${inviteUrl || ''}`}
      onClose={onClose}
      inviteUrl={inviteUrl}
      firstName={firstName}
    />
  )
}

export default NfcWriterModal
