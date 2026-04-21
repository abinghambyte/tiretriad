import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { auth, functions } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'
import { formatCurrency } from '../../utils/format'
import Spinner from '../ui/Spinner.jsx'

const getPayoutConfig = httpsCallable(functions, 'getPayoutConfig')
const updatePayoutConfig = httpsCallable(functions, 'updatePayoutConfig')

const SPLIT_ORDER = ['alex', 'dj', 'kyle']

function pctToFraction(pctStr) {
  const n = Number(String(pctStr).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function fractionToPctInput(frac) {
  const n = Number(frac)
  if (!Number.isFinite(n)) return ''
  return String((n * 100).toFixed(1))
}

export function PayoutConfigPanel() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [splits, setSplits] = useState({ alex: '35.0', dj: '35.0', kyle: '30.0' })
  const [taxes, setTaxes] = useState({
    countyTaxPct: '1.09',
    localTaxPct: '3.12',
    stateTaxPct: '3.02',
    tireFeePerTire: '2.00',
  })
  const [preview, setPreview] = useState({
    buy: '100.00',
    qty: '4',
    retail: '',
  })

  const load = useCallback(async () => {
    if (!auth.currentUser) return
    setLoading(true)
    setServerError('')
    try {
      const res = await getPayoutConfig()
      const cfg = res.data?.config
      if (!cfg?.splits || !cfg?.taxes) throw new Error('Invalid response')
      setSplits({
        alex: fractionToPctInput(cfg.splits.alex),
        dj: fractionToPctInput(cfg.splits.dj),
        kyle: fractionToPctInput(cfg.splits.kyle),
      })
      setTaxes({
        countyTaxPct: String((Number(cfg.taxes.countyTaxPct) * 100).toFixed(2)),
        localTaxPct: String((Number(cfg.taxes.localTaxPct) * 100).toFixed(2)),
        stateTaxPct: String((Number(cfg.taxes.stateTaxPct) * 100).toFixed(2)),
        tireFeePerTire: String(Number(cfg.taxes.tireFeePerTire).toFixed(2)),
      })
    } catch (e) {
      const msg = e?.message || String(e)
      setServerError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const splitFrac = useMemo(() => {
    const alex = pctToFraction(splits.alex)
    const dj = pctToFraction(splits.dj)
    const kyle = pctToFraction(splits.kyle)
    return { alex, dj, kyle, sum: alex + dj + kyle }
  }, [splits])

  const splitOk = Math.abs(splitFrac.sum - 1) <= 0.0001

  const taxRatesFrac = useMemo(() => {
    const countyTaxPct = pctToFraction(taxes.countyTaxPct)
    const localTaxPct = pctToFraction(taxes.localTaxPct)
    const stateTaxPct = pctToFraction(taxes.stateTaxPct)
    const tireFeePerTire = Number(taxes.tireFeePerTire)
    return { countyTaxPct, localTaxPct, stateTaxPct, tireFeePerTire }
  }, [taxes])

  const ledger = useMemo(() => {
    const round = (n) => Math.round(n * 100) / 100
    const buy = Number(preview.buy)
    const qty = Number(preview.qty)
    const retailRaw = String(preview.retail).trim()
    const hasRetail = retailRaw !== '' && Number.isFinite(Number(retailRaw))
    const retail = hasRetail ? Number(retailRaw) : 0

    const safeBuy = Number.isFinite(buy) ? buy : 0
    const safeQty = Number.isFinite(qty) ? qty : 0

    const buySubtotal = round(safeBuy * safeQty)
    const county = round(buySubtotal * (Number(taxRatesFrac.countyTaxPct) || 0))
    const local = round(buySubtotal * (Number(taxRatesFrac.localTaxPct) || 0))
    const state = round(buySubtotal * (Number(taxRatesFrac.stateTaxPct) || 0))
    const tireFee =
      Number.isFinite(taxRatesFrac.tireFeePerTire) && taxRatesFrac.tireFeePerTire >= 0
        ? round(taxRatesFrac.tireFeePerTire * safeQty)
        : 0
    const costTotal = round(buySubtotal + county + local + state + tireFee)

    const retailSubtotal = hasRetail ? round(retail * safeQty) : null
    const pool = hasRetail ? round(retailSubtotal - costTotal) : null
    const shares = hasRetail
      ? {
          alex: round(pool * (Number(splitFrac.alex) || 0)),
          dj: round(pool * (Number(splitFrac.dj) || 0)),
          kyle: round(pool * (Number(splitFrac.kyle) || 0)),
        }
      : null

    return {
      hasRetail,
      buySubtotal,
      county,
      local,
      state,
      tireFee,
      costTotal,
      retailSubtotal,
      pool,
      shares,
    }
  }, [preview, taxRatesFrac, splitFrac])

  const submit = async () => {
    setSaving(true)
    setServerError('')
    try {
      const payload = {
        splits: {
          alex: pctToFraction(splits.alex),
          dj: pctToFraction(splits.dj),
          kyle: pctToFraction(splits.kyle),
        },
        taxes: {
          countyTaxPct: pctToFraction(taxes.countyTaxPct),
          localTaxPct: pctToFraction(taxes.localTaxPct),
          stateTaxPct: pctToFraction(taxes.stateTaxPct),
          tireFeePerTire: Number(taxes.tireFeePerTire),
        },
      }
      await updatePayoutConfig(payload)
      toast('Payout config saved.')
      await load()
    } catch (e) {
      const msg = e?.message || String(e)
      setServerError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Payouts &amp; Taxes</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Pool split and buy-side tax rates applied at order completion. Changes take effect on the next
        completion; historical orders are not recomputed.
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
          <Spinner className="h-4 w-4 text-zinc-300" />
          Loading payout config…
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {serverError ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {serverError}
            </p>
          ) : null}

          <div>
            <h3 className="text-sm font-medium text-zinc-300">Profit share</h3>
            <p className="mt-1 text-xs text-zinc-500">Enter percentages; they must total 100%.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {SPLIT_ORDER.map((key) => (
                <label key={key} className="block text-xs font-medium text-zinc-500">
                  {key === 'alex' ? 'Alex' : key === 'dj' ? 'DJ' : 'Kyle'} (%)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={splits[key]}
                    onChange={(ev) => setSplits((s) => ({ ...s, [key]: ev.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              Sum: {(splitFrac.sum * 100).toFixed(2)}%{!splitOk ? ' — must total 100%' : ''}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-300">Buy-side taxes</h3>
            <p className="mt-1 text-xs text-zinc-500">Percentages are of tire buy cost × quantity.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-medium text-zinc-500">
                County (%)
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxes.countyTaxPct}
                  onChange={(ev) => setTaxes((t) => ({ ...t, countyTaxPct: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-500">
                Local (%)
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxes.localTaxPct}
                  onChange={(ev) => setTaxes((t) => ({ ...t, localTaxPct: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-500">
                State (%)
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxes.stateTaxPct}
                  onChange={(ev) => setTaxes((t) => ({ ...t, stateTaxPct: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-500">
                Tire fee ($/tire)
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxes.tireFeePerTire}
                  onChange={(ev) => setTaxes((t) => ({ ...t, tireFeePerTire: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-300">Live preview</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Try values below to see how the current rates and splits would apply. Values are not saved.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-zinc-500">
                Buy cost per tire ($)
                <input
                  type="text"
                  inputMode="decimal"
                  value={preview.buy}
                  onChange={(ev) => setPreview((p) => ({ ...p, buy: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-500">
                Quantity
                <input
                  type="text"
                  inputMode="decimal"
                  value={preview.qty}
                  onChange={(ev) => setPreview((p) => ({ ...p, qty: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-500">
                Retail per tire ($)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="optional"
                  value={preview.retail}
                  onChange={(ev) => setPreview((p) => ({ ...p, retail: ev.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
            </div>

            <table
              className="mt-4 w-full text-sm text-zinc-200"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <tbody className="divide-y divide-zinc-800">
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    Buy subtotal
                  </th>
                  <td className="py-1.5 text-right">{formatCurrency(ledger.buySubtotal)}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    County tax
                  </th>
                  <td className="py-1.5 text-right">{formatCurrency(ledger.county)}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    Local tax
                  </th>
                  <td className="py-1.5 text-right">{formatCurrency(ledger.local)}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    State tax
                  </th>
                  <td className="py-1.5 text-right">{formatCurrency(ledger.state)}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    Tire fee
                  </th>
                  <td className="py-1.5 text-right">{formatCurrency(ledger.tireFee)}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-medium text-zinc-200">
                    Cost total
                  </th>
                  <td className="py-1.5 text-right font-medium text-zinc-100">
                    {formatCurrency(ledger.costTotal)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    Retail subtotal
                  </th>
                  <td className="py-1.5 text-right">
                    {ledger.hasRetail ? formatCurrency(ledger.retailSubtotal) : '-'}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                    Pool (retail - cost)
                  </th>
                  <td className="py-1.5 text-right">
                    {ledger.hasRetail ? formatCurrency(ledger.pool) : '-'}
                  </td>
                </tr>
                {SPLIT_ORDER.map((key) => (
                  <tr key={`share-${key}`}>
                    <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                      {key === 'alex' ? 'Alex' : key === 'dj' ? 'DJ' : 'Kyle'} share
                    </th>
                    <td className="py-1.5 text-right">
                      {ledger.hasRetail && ledger.shares ? formatCurrency(ledger.shares[key]) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Preview uses the values in the form; saving writes them to meta/payoutConfig.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!splitOk || saving}
                onClick={() => void submit()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Spinner className="h-4 w-4 text-zinc-700" />}
                Save payout config
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
