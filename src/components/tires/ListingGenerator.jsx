import { useEffect, useState } from 'react'
import { buildListingScript } from '../../utils/listingGenerator'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_WIDE } from '../ui/modalChrome.js'

const PLATFORMS = [
  'Facebook Marketplace',
  'OfferUp',
  'Craigslist',
  'eBay',
]

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

export function ListingGenerator({ tires, onClose }) {
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [lines, setLines] = useState(() => initLines(tires))
  const [generated, setGenerated] = useState([])

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
              {tires.length} tire type{tires.length === 1 ? '' : 's'} selected
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
