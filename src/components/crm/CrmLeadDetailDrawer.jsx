import { useCallback, useEffect, useState } from 'react'
import { LeadSourceBadge } from './leadSourceBadge.jsx'
import { timeAgo } from '../../utils/timeAgo.js'

/**
 * @param {object} props
 * @param {Record<string, unknown> | null} props.lead
 * @param {() => void} props.onClose
 * @param {boolean} props.canEdit
 * @param {(lead: Record<string, unknown>) => void | Promise<void>} props.onConvertToVip
 */
export function CrmLeadDetailDrawer({ lead, onClose, canEdit, onConvertToVip }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const createdLabel = lead ? timeAgo(lead.createdAt) || '—' : '—'

  const copyConversationId = useCallback(async () => {
    const id = String(lead?.sinchConversationId ?? '').trim()
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [lead])

  if (!lead) return null

  const inquiryText = String(lead.inquiry ?? '').trim()
  const pageUrl = String(lead.pageUrl ?? '').trim()
  const referrer = String(lead.referrer ?? '').trim()
  const convId = String(lead.sinchConversationId ?? '').trim()
  const converted = Boolean(lead.convertedToAccountId)

  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end bg-black/70 p-0 backdrop-blur-md sk-modal-backdrop-enter sm:p-0"
      role="dialog"
      aria-modal
      aria-labelledby="crm-lead-drawer-title"
      onClick={onClose}
    >
      <div
        className="sk-panel-slide-in h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800/90 bg-zinc-950 p-6 shadow-2xl shadow-black/40 max-sm:max-w-none max-sm:border-l-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="crm-lead-drawer-title" className="text-lg font-semibold tracking-tight text-zinc-50 sm:text-xl">
              {lead.businessName || 'Lead'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <LeadSourceBadge source={lead.source} />
              <span className="text-xs text-zinc-500">{createdLabel}</span>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
            onClick={onClose}
            aria-label="Close panel"
          >
            <span className="text-xl leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        <section className="mt-6 space-y-1 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Contact</h3>
          <dl className="space-y-1 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-zinc-200">
            <div>
              <dt className="text-xs text-zinc-500">Name</dt>
              <dd>{String(lead.contactName ?? '').trim() || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Phone</dt>
              <dd>{String(lead.phone ?? '').trim() || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Email</dt>
              <dd className="break-all">{String(lead.email ?? '').trim() || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Inquiry</h3>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-200">
            {inquiryText || '\u2014'}
          </pre>
        </section>

        <section className="mt-6 space-y-3 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Context</h3>
          <div>
            <div className="text-xs text-zinc-500">Page URL</div>
            <div className="mt-0.5 truncate font-mono text-xs text-zinc-300" title={pageUrl || undefined}>
              {pageUrl || '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Referrer</div>
            <div className="mt-0.5 truncate font-mono text-xs text-zinc-300" title={referrer || undefined}>
              {referrer || '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Sinch conversation ID</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200">
                {convId || '—'}
              </code>
              {convId ? (
                <button
                  type="button"
                  onClick={() => void copyConversationId()}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap gap-2 border-t border-zinc-800 pt-6">
          {!converted && canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              onClick={(e) => {
                e.stopPropagation()
                void onConvertToVip(lead)
              }}
            >
              Convert to VIP client
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
