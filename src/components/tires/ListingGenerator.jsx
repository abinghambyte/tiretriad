import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase/config'
import { buildListingScript } from '../../utils/listingGenerator'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { effectiveCts } from '../../utils/ctsCalc'
import { parseDescription } from '../../utils/parseTireDescription'
import { formatCurrency } from '../../utils/format'
import { copyToClipboard } from '../../utils/copyToClipboard'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_WIDE } from '../ui/modalChrome.js'
import { timeAgo } from '../../utils/timeAgo'
import { listingStatus } from '../../utils/listingStatus'

const PLATFORMS = ['Facebook Marketplace', 'OfferUp', 'Craigslist']

const MARK_POSTED_PLATFORMS = [
  { key: 'facebook', short: 'FB', action: 'Mark FB posted' },
  { key: 'offerup', short: 'OU', action: 'Mark OU posted' },
  { key: 'craigslist', short: 'CL', action: 'Mark CL posted' },
]

/**
 * @param {object} props
 * @param {Record<string, unknown>} props.tire
 * @param {'idle' | 'saving' | 'done'} props.phase
 * @param {() => void} props.onMark
 */
function MarkPostedControl({ tire, platformKey, shortLabel, actionLabel, phase, onMark }) {
  const st = listingStatus(tire, platformKey)
  const ts = tire?.platformListings?.[platformKey]?.lastPostedAt

  if (phase === 'saving') {
    return <span className="text-xs text-zinc-500">Saving…</span>
  }
  if (phase === 'done') {
    return <span className="text-xs font-medium text-emerald-400">Posted ✓</span>
  }

  const recent = st === 'active'
  return (
    <button
      type="button"
      onClick={onMark}
      className={
        recent
          ? 'rounded-lg border border-transparent px-2 py-1.5 text-left text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
          : 'rounded-lg border border-zinc-600 bg-zinc-900/50 px-2 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500'
      }
    >
      {recent ? `${shortLabel} · posted ${timeAgo(ts) || '—'}` : `✓ ${actionLabel}`}
    </button>
  )
}

const listingAdvisorFn = httpsCallable(functions, 'listingAdvisor')

function formatJsonForDebug(value) {
  try {
    if (value === undefined) return '(undefined)'
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Callable occasionally delivers JSON as a string (or double-encoded). */
function unwrapCallableData(data) {
  let v = data
  for (let i = 0; i < 6 && typeof v === 'string'; i += 1) {
    const s = v.trim()
    if (!s.startsWith('{') && !s.startsWith('[')) break
    try {
      v = JSON.parse(s)
    } catch {
      break
    }
  }
  return v
}

function normalizeAdvisorFieldNames(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return p
  return {
    ...p,
    title: p.title ?? p.Title,
    description: p.description ?? p.Description,
    sellProbability: p.sellProbability ?? p.sell_probability,
    recommendedPrice: p.recommendedPrice ?? p.recommended_price,
    platformNotes: p.platformNotes ?? p.platform_notes,
  }
}

function coerceAdvisorListing(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return coerceAdvisorListing(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length === 1 && raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
      return coerceAdvisorListing(raw[0])
    }
    return null
  }
  if (typeof raw !== 'object') return null
  let p = raw
  if (p.listing && typeof p.listing === 'object' && !Array.isArray(p.listing)) {
    p = p.listing
  }
  p = normalizeAdvisorFieldNames(p)
  const hasAny =
    (p.title != null && String(p.title).trim() !== '') ||
    (p.description != null && String(p.description).trim() !== '') ||
    p.sellProbability != null ||
    p.recommendedPrice != null ||
    (p.platformNotes != null && String(p.platformNotes).trim() !== '')
  if (!hasAny) return null
  let sp = Math.round(Number(p.sellProbability))
  if (!Number.isFinite(sp)) sp = 50
  sp = Math.max(0, Math.min(100, sp))
  let rp = Number(p.recommendedPrice)
  if (!Number.isFinite(rp) || rp < 0) rp = 0
  return {
    title: String(p.title ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200),
    description: String(p.description ?? '').trim(),
    sellProbability: sp,
    recommendedPrice: rp,
    platformNotes: String(p.platformNotes ?? '').trim().slice(0, 280),
  }
}

/**
 * Unwraps callable `data` from `listingAdvisor` (nested `data`/`result`, stringified `listing`, or flat fields).
 * @param {unknown} data
 * @returns {{ listing: object, provider?: string, model?: string } | null}
 */
function parseListingAdvisorResponse(data) {
  const root = unwrapCallableData(data)
  if (root == null) return null
  if (typeof root !== 'object' || Array.isArray(root)) return null
  const layers = [root, root.data, root.result, root.payload].filter(
    (x) => x && typeof x === 'object' && !Array.isArray(x),
  )
  for (const layer of layers) {
    if ('listing' in layer && layer.listing != null) {
      const listing = coerceAdvisorListing(layer.listing)
      if (listing) {
        return {
          listing,
          provider: typeof layer.provider === 'string' ? layer.provider : undefined,
          model: typeof layer.model === 'string' ? layer.model : undefined,
        }
      }
    }
    const listing = coerceAdvisorListing(layer)
    if (listing) {
      return {
        listing,
        provider: typeof layer.provider === 'string' ? layer.provider : undefined,
        model: typeof layer.model === 'string' ? layer.model : undefined,
      }
    }
  }
  return null
}

function advisorCallableErrorMessage(err) {
  if (err?.code === 'functions/failed-precondition') {
    return String(
      err.message || 'AI listing advisor is not configured. Ask an admin to finish setup.',
    )
  }
  return err?.message || String(err)
}

function buildListingAdvisorRequestBody(t) {
  const tireParsed = parseDescription(t.description)
  return {
    input: {
      mspn: String(t.mspn || '').trim(),
      brand: String(t.brand || ''),
      description: String(t.description || ''),
      buyPrice: tireCatalogBuyNumber(t),
      ctsTotal: effectiveCts(t),
      parsed: {
        width: tireParsed.width,
        aspectRatio: tireParsed.aspectRatio,
        construction: tireParsed.construction,
        rimDiameter: tireParsed.rimDiameter,
        loadIndex: tireParsed.loadIndex,
        speedRating: tireParsed.speedRating,
        extraLoad: tireParsed.extraLoad,
        treadName: tireParsed.treadName,
      },
    },
  }
}

async function copyText(text) {
  return copyToClipboard(text)
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
  const { toast } = useToast()
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [lines, setLines] = useState(() => initLines(tires))
  const [generated, setGenerated] = useState([])
  const [advisorById, setAdvisorById] = useState({})
  const [advisorRunning, setAdvisorRunning] = useState(false)
  const [markPostedUi, setMarkPostedUi] = useState({})

  const markPosted = useCallback(async (tireId, platform) => {
    setMarkPostedUi((prev) => ({
      ...prev,
      [tireId]: { ...prev[tireId], [platform]: 'saving' },
    }))
    try {
      await updateDoc(doc(db, 'tires', tireId), {
        [`platformListings.${platform}.lastPostedAt`]: serverTimestamp(),
      })
      setMarkPostedUi((prev) => ({
        ...prev,
        [tireId]: { ...prev[tireId], [platform]: 'done' },
      }))
      window.setTimeout(() => {
        setMarkPostedUi((prev) => ({
          ...prev,
          [tireId]: { ...prev[tireId], [platform]: 'idle' },
        }))
      }, 2000)
    } catch (e) {
      console.error(e)
      toast(e instanceof Error ? e.message : 'Could not update listing timestamp.', 'error')
      setMarkPostedUi((prev) => ({
        ...prev,
        [tireId]: { ...prev[tireId], [platform]: 'idle' },
      }))
    }
  }, [toast])

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

  async function runAllAdvisors() {
    if (!canGenerate) return
    setAdvisorRunning(true)
    for (const t of tires) {
      setAdvisorById((prev) => ({ ...prev, [t.id]: { status: 'loading' } }))
    }
    try {
      await Promise.all(
        tires.map(async (t) => {
          let rawUnwrapped = null
          try {
            const callableResult = await listingAdvisorFn(buildListingAdvisorRequestBody(t))
            rawUnwrapped = unwrapCallableData(callableResult?.data)
            // Same object as below — copy from DevTools or expand "Raw callable payload" on errors.
            console.log('[listingAdvisor] raw callable response', {
              mspn: String(t.mspn || '').trim(),
              tireId: t.id,
              data: rawUnwrapped,
            })
            const advisorPayload = parseListingAdvisorResponse(rawUnwrapped)
            if (!advisorPayload?.listing) {
              const serverParse =
                rawUnwrapped &&
                typeof rawUnwrapped === 'object' &&
                typeof rawUnwrapped.parseError === 'string'
                  ? rawUnwrapped.parseError
                  : null
              const serverError =
                rawUnwrapped &&
                typeof rawUnwrapped === 'object' &&
                typeof rawUnwrapped.error === 'string'
                  ? rawUnwrapped.error
                  : null
              setAdvisorById((prev) => ({
                ...prev,
                [t.id]: {
                  status: 'error',
                  message:
                    serverParse ||
                    serverError ||
                    'Advisor responded, but the payload could not be read as a listing (expected listing or title/description fields). Open the raw payload below.',
                  rawDebug: formatJsonForDebug(rawUnwrapped),
                },
              }))
              return
            }
            setAdvisorById((prev) => ({
              ...prev,
              [t.id]: {
                status: 'done',
                provider: advisorPayload.provider,
                model: advisorPayload.model,
                listing: advisorPayload.listing,
              },
            }))
          } catch (e) {
            const msg = advisorCallableErrorMessage(e)
            const errMeta =
              e && typeof e === 'object'
                ? { code: e.code, message: e.message, details: e.details }
                : { thrown: String(e) }
            setAdvisorById((prev) => ({
              ...prev,
              [t.id]: {
                status: 'error',
                message: msg,
                rawDebug: formatJsonForDebug({
                  note: rawUnwrapped == null ? 'Callable threw before data was assigned.' : 'Callable data at failure time.',
                  callableData: rawUnwrapped,
                  error: errMeta,
                }),
              },
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
                    {t.brand} · {t.description}
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
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-red-300">{adv.message}</p>
                      {adv.rawDebug ? (
                        <details className="rounded-lg border border-zinc-700/80 bg-zinc-950/60 p-2">
                          <summary className="cursor-pointer select-none text-[11px] text-zinc-400 hover:text-zinc-300">
                            Raw callable payload (debug)
                          </summary>
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-zinc-500">
                            {adv.rawDebug}
                          </pre>
                          <button
                            type="button"
                            onClick={() => void copyText(adv.rawDebug)}
                            className="mt-2 text-[11px] text-amber-200/90 hover:underline"
                          >
                            Copy raw payload
                          </button>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                  {adv?.status === 'done' && adv.listing ? (
                    <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {adv.provider ? (
                          <span className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            {String(adv.provider).replace(/_/g, ' ')}
                          </span>
                        ) : null}
                        {adv.model ? (
                          <span className="rounded-md bg-emerald-950/35 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-emerald-300/90 ring-1 ring-emerald-900/45">
                            {adv.model}
                          </span>
                        ) : null}
                        <span className="text-[10px] font-medium text-emerald-600/75">
                          Advisor completed
                        </span>
                      </div>
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
              {generated.map((g, i) => {
                const tire = tires[i]
                return (
                  <div key={tire?.id ?? i} className="space-y-3">
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
                    {tire?.id ? (
                      <div className="border-t border-zinc-800/80 pt-3">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                          Listing activity
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {MARK_POSTED_PLATFORMS.map(({ key, short, action }) => (
                            <MarkPostedControl
                              key={key}
                              tire={tire}
                              platformKey={key}
                              shortLabel={short}
                              actionLabel={action}
                              phase={markPostedUi[tire.id]?.[key] ?? 'idle'}
                              onMark={() => void markPosted(tire.id, key)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
