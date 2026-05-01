import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db, functions } from '../../../firebase/config'
import { useToast } from '../../../context/ToastContext.jsx'

const attachFn = httpsCallable(functions, 'attachInvoiceLine')

/**
 * Subscribes to invoices in 'pending' or 'partial' state and surfaces
 * unattached lines with the top 3 candidate orders, ranked by
 * (MSPN, qty) match plus date proximity to the invoice docDate.
 */
export function InvoiceLineReviewQueue() {
  const [invoices, setInvoices] = useState([])
  const [pendingByInvoice, setPendingByInvoice] = useState(new Map())
  const [acting, setActing] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    const q = query(
      collection(db, 'invoices'),
      where('status', 'in', ['pending', 'partial']),
      orderBy('importedAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadCandidates() {
      const next = new Map()
      for (const inv of invoices) {
        const items = []
        const lines = Array.isArray(inv.lines) ? inv.lines : []
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i]
          if (line.attachedOrderId) continue
          let candidates = []
          try {
            const cQ = query(
              collection(db, 'orders'),
              where('status', '==', 'completed'),
              where('mspn', '==', line.mspn),
              limit(20),
            )
            const cSnap = await getDocs(cQ)
            const docDateMs = inv.docDate ? new Date(inv.docDate).getTime() : 0
            candidates = cSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((o) => Number(o.quantity) === Number(line.qty))
              .map((o) => ({
                ...o,
                dateScore:
                  Math.abs(docDateMs - (Number(o.completedMs) || 0)) /
                  (24 * 60 * 60 * 1000),
              }))
              .sort((a, b) => a.dateScore - b.dateScore)
              .slice(0, 3)
          } catch (err) {
            console.error('InvoiceLineReviewQueue candidate query', err)
          }
          items.push({ lineIndex: i, line, candidates })
        }
        if (items.length > 0) next.set(inv.id, items)
      }
      if (!cancelled) setPendingByInvoice(next)
    }
    void loadCandidates()
    return () => {
      cancelled = true
    }
  }, [invoices])

  async function attach(invoiceId, lineIndex, orderId) {
    const key = `${invoiceId}:${lineIndex}:${orderId}`
    setActing(key)
    try {
      await attachFn({ invoiceId, lineIndex, orderId })
      toast(`Attached line ${lineIndex} to order ${orderId}`, 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setActing(null)
    }
  }

  if (invoices.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        No invoices awaiting review.
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-zinc-100">Review queue</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Lines without an auto-attached portal order.
      </p>
      <div className="mt-4 space-y-4">
        {invoices.map((inv) => {
          const items = pendingByInvoice.get(inv.id) || []
          if (items.length === 0) return null
          return (
            <div key={inv.id} className="rounded-xl border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400">
                Invoice <span className="font-mono text-zinc-200">{inv.docNumber}</span>{' '}
                · DR <span className="font-mono text-zinc-200">{inv.dr}</span>{' '}
                · {inv.docDate || '--'}
              </div>
              <div className="mt-2 space-y-3">
                {items.map(({ lineIndex, line, candidates }) => (
                  <div
                    key={lineIndex}
                    className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-2"
                  >
                    <div className="text-xs">
                      Line <span className="font-mono">{line.mspn}</span> · qty{' '}
                      <span className="font-mono">{line.qty}</span> · $
                      {Number(line.extended || 0).toFixed(2)}
                    </div>
                    {candidates.length === 0 ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        No candidates within +/- 14 days.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {candidates.map((c) => {
                          const key = `${inv.id}:${lineIndex}:${c.id}`
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => void attach(inv.id, lineIndex, c.id)}
                              disabled={acting === key}
                              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-50"
                            >
                              {c.id} · {c.customer || 'unknown'} ·{' '}
                              {Math.round(c.dateScore)}d
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
