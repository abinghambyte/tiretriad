/* eslint-disable react-refresh/only-export-components -- shared invite helpers and UI */
import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { copyToClipboard } from '../../utils/copyToClipboard'
import { cmdEnterInvokeKeyDown } from '../../utils/cmdEnterSubmit.js'
import { formatPhoneInputForDisplay } from '../../utils/formatPhone.js'
import { crewTagFromRole } from '../../constants/peoplePermissions'
import Spinner from '../ui/Spinner.jsx'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_PANEL,
} from '../ui/modalChrome.js'
import { BRAND } from '../../config/brand.js'

const NFC_TOOLS_WRITE_INTENT =
  'intent://write#Intent;scheme=nfctools;package=com.wakdev.wdnfc;end'

export function inviteUrlFromToken(token) {
  const t = String(token || '').trim()
  if (!t) return ''
  return `${BRAND.inviteUrlBase}/${t}`
}

function shouldShowAndroidInviteHardwareActions() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (typeof window.NDEFReader !== 'undefined') return true
  return /Android/i.test(navigator.userAgent || '')
}

/**
 * Copy + Web NFC + NFC Tools fallback (mobile-first layout via max-sm / sm).
 * @param {{ url: string }} props
 */
export function InviteUrlToolkit({ url }) {
  const safeUrl = String(url || '').trim()
  const [nfcHint, setNfcHint] = useState('')
  const [nfcBusy, setNfcBusy] = useState(false)
  const [nfcSuccess, setNfcSuccess] = useState('')
  const [nfcErr, setNfcErr] = useState('')
  const showHardware = shouldShowAndroidInviteHardwareActions()
  const { toast: toastFn } = useToast()

  async function copyUrl() {
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(50)
    } catch {
      /* ignore */
    }
    const ok = await copyToClipboard(safeUrl)
    if (ok) {
      toastFn?.('Invite URL copied', 'success')
    } else {
      toastFn?.(`Copy this URL: ${safeUrl}`, 'info')
    }
  }

  async function writeNfcCard() {
    if (!safeUrl) return
    setNfcErr('')
    setNfcSuccess('')
    setNfcHint('Hold card to back of phone…')
    setNfcBusy(true)
    await new Promise((r) => setTimeout(r, 450))
    try {
      const Reader = window.NDEFReader
      if (typeof Reader !== 'function') {
        throw new Error('Web NFC is not available in this browser. Use Open NFC Tools below.')
      }
      const ndef = new Reader()
      await ndef.write({ records: [{ recordType: 'url', data: safeUrl }] })
      setNfcSuccess('Card programmed ✅ tap another to write again')
      setNfcHint('')
    } catch (e) {
      setNfcErr(e?.message || String(e))
      setNfcHint('')
    } finally {
      setNfcBusy(false)
    }
  }

  function openNfcTools() {
    try {
      window.location.href = NFC_TOOLS_WRITE_INTENT
    } catch {
      /* ignore */
    }
  }

  if (!safeUrl) return null

  return (
    <div className="space-y-3">
      <pre className="max-h-40 overflow-y-auto scroll-smooth whitespace-pre-wrap break-all rounded-xl border border-emerald-900/40 bg-black/30 p-3 font-mono text-[13px] leading-snug text-emerald-50/95 max-sm:max-h-none max-sm:min-h-[4.5rem] max-sm:p-4 max-sm:text-sm sm:max-h-48 sm:text-xs">
        {safeUrl}
      </pre>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="min-h-[44px] rounded-xl border border-emerald-600/60 bg-emerald-900/35 px-4 text-sm font-semibold text-emerald-50 hover:bg-emerald-900/55 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
        >
          Copy URL
        </button>
        {showHardware ? (
          <>
            <button
              type="button"
              disabled={nfcBusy}
              onClick={() => void writeNfcCard()}
              className="min-h-[44px] rounded-xl border border-amber-500/55 bg-amber-950/40 px-4 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/40 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
            >
              {nfcBusy ? 'Writing…' : 'Write to NFC card'}
            </button>
            <button
              type="button"
              onClick={openNfcTools}
              className="min-h-[44px] rounded-xl border border-zinc-600 bg-zinc-900/60 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
            >
              Open NFC Tools
            </button>
          </>
        ) : null}
      </div>
      {!showHardware && safeUrl ? (
        <div className="flex flex-col items-center gap-2 pt-1 sm:pt-2">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(safeUrl)}&size=180x180&margin=2&color=e4e4e7&bgcolor=09090b`}
            alt="Scan to open invite on phone"
            width={180}
            height={180}
            className="rounded-xl"
          />
          <p className="text-center text-xs text-zinc-400">
            Scan to open on phone, or write to NFC card.
          </p>
        </div>
      ) : null}
      {nfcHint ? <p className="text-sm text-amber-100/90">{nfcHint}</p> : null}
      {nfcSuccess ? <p className="text-sm text-emerald-200">{nfcSuccess}</p> : null}
      {nfcErr ? <p className="text-sm text-amber-200">{nfcErr}</p> : null}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, inputMode, autoComplete, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400 max-sm:mb-2 max-sm:text-[13px]">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow duration-200 placeholder:text-zinc-600 focus:border-amber-600/45 focus:ring-2 focus:ring-amber-500/25 max-sm:min-h-[44px] max-sm:py-3"
      />
    </label>
  )
}

function formatDeliveryTimestamp(value) {
  if (!value) return null
  let ms = null
  if (typeof value?.toMillis === 'function') ms = value.toMillis()
  else if (typeof value?.seconds === 'number') ms = value.seconds * 1000
  else if (typeof value === 'number') ms = value
  if (!Number.isFinite(ms) || ms <= 0) return null
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function channelLabel(attempted) {
  if (attempted === 'sms') return 'SMS'
  if (attempted === 'nfc') return 'NFC link'
  return 'Email'
}

function LastDeliveryRow({ lastInviteDelivery, inviteDelivery }) {
  const fallbackLabel = channelLabel(inviteDelivery)
  if (!lastInviteDelivery || typeof lastInviteDelivery !== 'object') {
    return (
      <p className="mt-2 text-[11px] text-amber-300/90">
        {fallbackLabel} status unknown - no delivery has been recorded for this invite. Click Resend.
      </p>
    )
  }
  const sent = !!lastInviteDelivery.sent
  const reason = String(lastInviteDelivery.reason || '')
  const ts = formatDeliveryTimestamp(lastInviteDelivery.sentAt)
  const label = channelLabel(lastInviteDelivery.attempted || inviteDelivery)
  if (sent) {
    return (
      <p className="mt-2 text-[11px] text-emerald-300/90">
        {label} sent{ts ? ` ${ts}` : ''}.
      </p>
    )
  }
  return (
    <p className="mt-2 text-[11px] text-red-300/90">
      {label} failed{ts ? ` at ${ts}` : ''}{reason ? ` (${reason})` : ''}. Click Resend.
    </p>
  )
}

/**
 * Invite column in the user editor: active link, revoke, reissue, resend.
 */
export function EditorInviteColumn({
  selected,
  panelInviteUrl,
  invokeBusy,
  revokeConfirmPending,
  onRevokeInvite,
  onReissueInvite,
  onResendInvite,
}) {
  const inviteChannel = selected?.inviteDelivery
  const resendLabel = `Resend ${channelLabel(inviteChannel).toLowerCase()}`
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Invite</p>
      {panelInviteUrl ? (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/15 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/90">
              Active link
            </p>
            <div className="flex items-center gap-1">
              {typeof onResendInvite === 'function' && inviteChannel !== 'nfc' ? (
                <button
                  type="button"
                  disabled={invokeBusy !== ''}
                  onClick={() => void onResendInvite()}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-900/50 transition-colors hover:bg-emerald-950/50 hover:text-emerald-200 disabled:opacity-40"
                >
                  {invokeBusy === 'resend' && <Spinner className="h-3 w-3 text-emerald-300" />}
                  {invokeBusy === 'resend' ? 'Sending…' : resendLabel}
                </button>
              ) : null}
              <button
                type="button"
                disabled={invokeBusy !== ''}
                onClick={() => void onRevokeInvite()}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-red-400/80 ring-1 ring-red-900/40 transition-colors hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40"
              >
                {invokeBusy === 'revoke' && <Spinner className="h-3 w-3 text-red-400/80" />}
                {invokeBusy === 'revoke'
                  ? 'Revoking…'
                  : revokeConfirmPending
                    ? 'Confirm revoke?'
                    : 'Revoke'}
              </button>
            </div>
          </div>
          <InviteUrlToolkit url={panelInviteUrl} />
          <LastDeliveryRow
            lastInviteDelivery={selected?.lastInviteDelivery}
            inviteDelivery={inviteChannel}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
          <p className="text-xs text-zinc-400">No active invite.</p>
          {selected && !selected.inviteAccepted ? (
            <button
              type="button"
              disabled={invokeBusy !== ''}
              onClick={() => void onReissueInvite()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            >
              {invokeBusy === 'reissue' && <Spinner className="h-3 w-3 text-zinc-300" />}
              {invokeBusy === 'reissue' ? 'Sending…' : 'New invite'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Create user + invite section (desktop form and mobile drawer shell).
 */
export function CreateUserInviteSection({
  isMobilePeople,
  createDrawerOpen,
  setCreateDrawerOpen,
  fn,
  setFn,
  ln,
  setLn,
  email,
  setEmail,
  phone,
  setPhone,
  role,
  setRole,
  delivery,
  setDelivery,
  accessDate,
  setAccessDate,
  createBusy,
  lastInviteUrl,
  onSubmitCreateUser,
  onOpenInvitePreview,
}) {
  return (
    <section
      className={[
        'rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6',
        isMobilePeople
          ? createDrawerOpen
            ? 'fixed inset-0 z-50 overflow-y-auto overscroll-y-contain scroll-smooth pb-24'
            : 'hidden'
          : '',
      ].join(' ')}
    >
      <div className="mb-4 flex items-start justify-between gap-2 sm:mb-0 sm:hidden">
        <h2 className="text-lg font-semibold text-zinc-100">Create user + invite</h2>
        <button
          type="button"
          onClick={() => setCreateDrawerOpen(false)}
          className="min-h-[44px] shrink-0 text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200"
        >
          Close
        </button>
      </div>
      <h2 className="hidden text-lg font-semibold text-zinc-100 sm:block">Create user + invite</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Adds a crew member and sends them a sign-in invite. They&apos;ll stay inactive until
        they accept. Use Preview to see the email before sending.
      </p>
      <form
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={cmdEnterInvokeKeyDown(() => {
          void onSubmitCreateUser()
        })}
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="First name" value={fn} onChange={setFn} required />
        <Field label="Last name" value={ln} onChange={setLn} required />
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <Field
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={(v) => {
            const all = String(v || '').replace(/\D/g, '')
            const national = all.startsWith('1') ? all.slice(1) : all
            setPhone(formatPhoneInputForDisplay(national.slice(0, 10)))
          }}
        />
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400 max-sm:mb-2 max-sm:text-[13px]">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Role"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
          >
            <option value="admin">{crewTagFromRole('admin')}</option>
            <option value="supplier">{crewTagFromRole('supplier')}</option>
            <option value="mechanic">{crewTagFromRole('mechanic')}</option>
            <option value="viewer">{crewTagFromRole('viewer')}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400 max-sm:mb-2 max-sm:text-[13px]">Delivery</span>
          <select
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            aria-label="Delivery"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
          >
            <option value="sms">SMS</option>
            <option value="nfc">NFC</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400 max-sm:mb-2 max-sm:text-[13px]">
            Access expiry (optional)
          </span>
          <input
            type="date"
            value={accessDate}
            onChange={(e) => setAccessDate(e.target.value)}
            aria-label="Access expiry"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
          />
        </label>
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:flex-wrap sm:items-end lg:col-span-3">
          <button
            type="button"
            disabled={createBusy}
            onClick={() => void onOpenInvitePreview()}
            className="min-h-[44px] rounded-xl border border-violet-500/60 bg-violet-950/40 px-5 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-50 max-sm:w-full sm:min-h-0 sm:w-auto"
          >
            Preview invite
          </button>
        </div>
      </form>
      {lastInviteUrl ? (
        <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm max-sm:p-5">
          <p className="font-medium text-emerald-200">Invite URL (copy for SMS / NFC / email)</p>
          <div className="mt-3">
            <InviteUrlToolkit url={lastInviteUrl} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Invite preview and post-create URL modal.
 */
export function InvitePreviewModal({
  previewOpen,
  onClose,
  previewShowCreatedUrl,
  lastInviteUrl,
  delivery,
  previewLoading,
  previewError,
  previewGreeting,
  createBusy,
  onSubmitCreateUser,
}) {
  useEffect(() => {
    if (!previewOpen) return undefined
    function onKey(e) {
      if (e.key === 'Escape' && !createBusy) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, createBusy, onClose])

  if (!previewOpen) return null

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-invite-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !createBusy) onClose()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL} relative border-zinc-800 bg-zinc-950 p-6 max-sm:p-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={createBusy}
          className="absolute right-3 top-3 rounded p-1 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>
        {previewShowCreatedUrl && lastInviteUrl ? (
          <>
            <h2 id="preview-invite-title" className="text-lg font-semibold text-white">
              Invite link ready
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400 max-sm:text-[15px]">
              Copy this URL or write it to an NFC card. Stay in the browser on your Pixel.
            </p>
            <div className="mt-4">
              <InviteUrlToolkit url={lastInviteUrl} />
            </div>
            <div className="mt-6 flex flex-col gap-2 max-sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 max-sm:w-full sm:min-h-0 sm:w-auto"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="preview-invite-title" className="text-lg font-semibold text-white">
                Invite preview
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                {delivery === 'sms' ? 'SMS link' : delivery === 'nfc' ? 'NFC tag' : 'Email link'}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              <span className="font-medium text-zinc-300">Entrance:</span> Dark screen, bolt
              animation, Tire Triad reveal. Then a short generative greeting, then registration.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {delivery === 'sms'
                ? 'The recipient gets a text with a direct link and can open it on their phone.'
                : delivery === 'nfc'
                  ? 'The NFC writer opens after the crew record is created so the invite URL can be written onto a physical tag.'
                  : 'The recipient gets an email with a direct link.'}
            </p>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Sample greeting</p>
              {previewLoading ? (
                <p className="mt-2 text-sm text-zinc-400">Loading greeting…</p>
              ) : previewError ? (
                <p className="mt-2 text-sm text-red-300">{previewError}</p>
              ) : (
                <p className="mt-2 text-sm italic text-zinc-200">&ldquo;{previewGreeting}&rdquo;</p>
              )}
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Registration steps</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
                <li>Email (must match invite)</li>
                <li>6-digit code (sent to email)</li>
                <li>First and last name</li>
                <li>Phone</li>
                <li>Password, then sign in and first-login handshake</li>
                <li>Join Slack workspace</li>
              </ol>
            </div>
            <div className="mt-6 flex flex-col gap-2 max-sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 max-sm:order-2 max-sm:w-full sm:min-h-0 sm:w-auto"
                onClick={onClose}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createBusy || previewLoading}
                onClick={() => void onSubmitCreateUser()}
                className="min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 max-sm:order-1 max-sm:w-full sm:min-h-0 sm:w-auto"
              >
                {createBusy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
