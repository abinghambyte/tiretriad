import { useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../firebase/config'
import { useToast } from '../../../context/ToastContext.jsx'
import { parseEfleetInvoice } from '../../../utils/parseEfleetInvoice.js'

const importInvoiceFn = httpsCallable(functions, 'importInvoice')

/**
 * Drop zone for a Michelin invoice HTML file. Parses on-device, shows a
 * preview, then commits via the importInvoice callable on demand.
 */
export function InvoiceImportPanel({ onImported }) {
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const fileInputRef = useRef(null)
  const { toast } = useToast()

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const inv = parseEfleetInvoice(text)
      setParsed(inv)
    } catch (err) {
      setError(String(err?.message || err))
      setParsed(null)
    }
  }

  function discard() {
    setParsed(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function commit() {
    if (!parsed || pending) return
    setPending(true)
    try {
      const result = await importInvoiceFn({ invoice: parsed })
      const data = result?.data || {}
      const attached = Number(data.attachedCount) || 0
      const status = data.status || 'imported'
      toast(
        `Imported ${parsed.docNumber} (${attached} attached, status ${status})`,
        'success',
      )
      discard()
      onImported?.(data)
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-zinc-100">Import eFleet invoice</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Drop a Michelin invoice HTML file. Preview parses on-device; nothing writes until you click Import.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,text/html"
        onChange={onFile}
        aria-label="Invoice HTML file"
        className="mt-3 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-100 hover:file:bg-zinc-700"
      />
      {error ? (
        <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-xs text-red-200">
          Parse error: {error}
        </p>
      ) : null}
      {parsed ? (
        <div className="mt-4 space-y-2 text-sm text-zinc-200">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
            <div>Doc <span className="font-mono">{parsed.docNumber}</span></div>
            <div>DR <span className="font-mono">{parsed.dr}</span></div>
            <div>Date <span className="font-mono">{parsed.docDate || '--'}</span></div>
            <div>
              Total{' '}
              <span className="font-mono">
                ${Number(parsed.invoiceTotal || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left">MSPN</th>
                  <th className="px-2 py-1 text-right">Qty</th>
                  <th className="px-2 py-1 text-right">Net Unit</th>
                  <th className="px-2 py-1 text-right">FET</th>
                  <th className="px-2 py-1 text-right">Extended</th>
                </tr>
              </thead>
              <tbody>
                {(parsed.lines || []).map((l, i) => (
                  <tr key={i} className="border-t border-zinc-800/60 text-zinc-200">
                    <td className="px-2 py-1 font-mono">{l.mspn}</td>
                    <td className="px-2 py-1 text-right font-mono">{l.qty}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      ${Number(l.netUnitPrice || 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      ${Number(l.unitFet || 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      ${Number(l.extended || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={discard}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={pending}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {pending ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
