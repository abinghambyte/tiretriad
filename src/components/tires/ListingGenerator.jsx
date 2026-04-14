import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import { buildListingScript } from '../../utils/listingGenerator'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { effectiveCts } from '../../utils/ctsCalc'
import { parseDescription } from '../../utils/parseTireDescription'
import { formatCurrency } from '../../utils/format'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_WIDE } from '../ui/modalChrome.js'

const PLATFORMS = [
  'Facebook Marketplace',
  'OfferUp',
  'Craigslist',
  'eBay',
]

const listingAdvisorFn = httpsCallable(functions, 'listingAdvisor')

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copy:', text)
  }
}

function initLines(tires) {
  const init = {}
  for (const t of tires) {
    init[t.id] = {
      qty: 4,
      price: tireCatalogBuyNumber(t),
    }
  }
  return init
}

function sellProbBadgeClass(p) {
  const n = Math.round(Number(p)) || 0
  if (n < 40) return 'bg-red-950/90 text-red-200 ring-1 ring-red-900/60'
  if (n <= 70) return 'bg-amber-950/90 text-amber-200 ring-1 ring-amber-900/50'
  return 'bg-emerald-950/90 text-emerald-200 ring-1 ring-emerald-900/50'
}

function SellProbabilityBadge({ value }) {
  const n = Math.max(0, Math.min(100, Math.round(Number(value)) || 0))
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${sellProbBadgeClass(n)}`}>
      {n}% sell probability
    </span>
  )
}

/**
 * @param {object} props
 * @param {object[]} props.tires
 * @param {() => void} props.onClose
 * @param {(p: { mspn: string, quantity: number, pricePerTire: number }) => void} [props.onUseRecommendedPrice]
 */
export function ListingGenerator({ tires, onClose, onUseRecommendedPrice }) {
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [lines, setLines] = useState(() => initLines(tires))
  const [generated, setGenerated] = useState([])
  const [advisorById, setAdvisorById] = useState({})
  const [advisorRunning, setAdvisorRunning] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canGenerate = tires.length > 0

  function updateLine(id, patch) {
    setLines((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  function handleGenerate() {
    const out = []
    for (const t of tires) {
      const line = lines[t.id] || { qty: 1, price: 0 }
      const qty = Math.max(1, Number(line.qty) || 1)
      const price = Math.max(0, Number(line.price) || 0)
      out.push(
        buildListingScript({
          tire: t,
          qty,
          pricePer: price,
          platform,
        }),
      )
    }
    setGenerated(out)
  }

  async function runAdvisorForTire(t) {
    const parsed = parseDescription(t.description)
    const input = {
      mspn: String(t.mspn || '').trim(),
      brand: String(t.brand || ''),
      description: String(t.description || ''),
      buyPrice: tireCatalogBuyNumber(t),
      ctsTotal: effectiveCts(t),
      parsed: {
        width: parsed.width,
        aspectRatio: parsed.aspectRatio,
        construction: parsed.construction,
        rimDiameter: parsed.rimDiameter,
        loadIndex: parsed.loadIndex,
        speedRating: parsed.speedRating,
        extraLoad: parsed.extraLoad,
        treadName: parsed.treadName,
      },
    }
    const { data } = await listingAdvisorFn({ input })
    return data
  }

  async function runAllAdvisors() {
    if (!canGenerate) return
    setAdvisorRunning(true)
    for (const t of tires) {
      setAdvisorById((prev) => ({ ...prev, [t.id]: { status: 'loading' } }))
    }
    try {
      await Promise.all(
        tires.map(async (t) => {
          try {
            const data = await runAdvisorForTire(t)
            const listing = data?.listing
            if (!listing || typeof listing !== 'object') {
              throw new Error('Invalid advisor response')
            }
            setAdvisorById((prev) => ({
              ...prev,
              [t.id]: { status: 'done', provider: data.provider, listing },
            }))
          } catch (e) {
            const msg =
              e?.code === 'functions/failed-precondition'
                ? String(e.message || 'Configure GEMINI_API_KEY or ANTHROPIC_API_KEY in Secret Manager.')
                : e?.message || String(e)
            setAdvisorById((prev) => ({
              ...prev,
              [t.id]: { status: 'error', message: msg },
            }))
          }
        }),
      )
    } finally {
      setAdvisorRunning(false)
    }
  }

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-gen-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL_WIDE} border-zinc-800 bg-zinc-950 p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2
              id="listing-gen-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Listing script generator
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {tires.length} tire type{tires.length === 1 ? '' : 's'} selected · AI listing advisor for titles,
              copy, sell probability, and suggested price
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
            <h3 className="text-sm font-semibold text-violet-100">AI listing advisor</h3>
            <p className="mt-1 text-xs text-violet-200/80">
              Uses parsed tire specs + catalog buy / CTS. Runs one model call per SKU (Gemini when configured,
              otherwise Anthropic). Results appear under each tire below.
            </p>
            <button
              type="button"
              disabled={!canGenerate || advisorRunning}
              onClick={() => void runAllAdvisors()}
              className="mt-3 w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {advisorRunning ? 'Analyzing…' : 'Run AI advisor for all SKUs'}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500">
              Platform target
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {tires.map((t) => {
              const line = lines[t.id] || { qty: 4, price: 0 }
              const adv = advisorById[t.id]
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <p className="text-sm font-medium text-zinc-200">
                    {t.brand} — {t.description}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">
                    {t.mspn}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-zinc-500">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) =>
                          updateLine(t.id, { qty: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">
                        Price / tire (USD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.price}
                        onChange={(e) =>
                          updateLine(t.id, { price: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      />
                    </div>
                  </div>

                  {adv?.status === 'loading' ? (
                    <p className="mt-3 text-xs text-zinc-500">AI advisor running…</p>
                  ) : null}
                  {adv?.status === 'error' ? (
                    <p className="mt-3 text-xs text-red-300">{adv.message}</p>
                  ) : null}
                  {adv?.status === 'done' && adv.listing ? (
                    <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4">
                      {adv.provider ? (
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                          via {String(adv.provider).replace(/_/g, ' ')}
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-2 max-sm:items-start sm:flex-row sm:flex-wrap sm:items-center">
                        <SellProbabilityBadge value={adv.listing.sellProbability} />
                        <span className="text-sm text-zinc-300">
                          Recommended:{' '}
                          <span className="font-semibold text-amber-200">
                            {formatCurrency(adv.listing.recommendedPrice)}
                          </span>{' '}
                          / tire
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-400">Platform:</span>{' '}
                        {adv.listing.platformNotes || '—'}
                      </p>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-zinc-500">AI title</span>
                        </div>
                        <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-200">
                          {adv.listing.title}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-zinc-500">AI description</div>
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-300">
                          {adv.listing.description}
                        </pre>
                      </div>
                      <div className="flex flex-col gap-2 max-sm:w-full sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              `${adv.listing.title}\n\n${adv.listing.description}`,
                            )
                          }
                          className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 max-sm:w-full sm:min-w-0"
                        >
                          Copy listing
                        </button>
                        <button
                          type="button"
                          disabled={
                            !onUseRecommendedPrice ||
                            !t.mspn ||
                            !Number.isFinite(Number(adv.listing.recommendedPrice)) ||
                            Number(adv.listing.recommendedPrice) <= 0
                          }
                          onClick={() => {
                            const qty = Math.max(1, Number(line.qty) || 1)
                            const pricePerTire = Number(adv.listing.recommendedPrice)
                            onUseRecommendedPrice?.({
                              mspn: String(t.mspn).trim(),
                              quantity: qty,
                              pricePerTire,
                            })
                          }}
                          className="rounded-lg bg-amber-700/90 px-3 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full sm:min-w-0"
                        >
                          Use recommended price in Sale Messenger
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <button
            type="button"
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="w-full rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate scripts
          </button>

          {generated.length > 0 ? (
            <div className="space-y-6 border-t border-zinc-800 pt-6">
              {generated.map((g, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-zinc-300">
                      Block {i + 1}
                    </h3>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Title</span>
                      <button
                        type="button"
                        onClick={() => copyText(g.title)}
                        className="text-xs text-amber-200/90 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-200">
                      {g.title}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Description</span>
                      <button
                        type="button"
                        onClick={() => copyText(g.description)}
                        className="text-xs text-amber-200/90 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                      {g.description}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
