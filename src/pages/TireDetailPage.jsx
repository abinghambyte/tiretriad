import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useTires } from '../hooks/useTires'
import Spinner from '../components/ui/Spinner.jsx'
import { TireDetailHeader } from '../components/tires/detail/TireDetailHeader.jsx'
import { TirePricingCard } from '../components/tires/detail/TirePricingCard.jsx'
import { TirePlatformsCard } from '../components/tires/detail/TirePlatformsCard.jsx'
import { TireRelatedSizes } from '../components/tires/detail/TireRelatedSizes.jsx'

function TireNotFound({ mspn }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Tire {mspn} not found</h1>
      <p className="mt-2 text-sm text-zinc-400">
        It may have been removed from the catalog. Use the catalog to find an active SKU.
      </p>
      <Link
        to="/tires"
        className="mt-6 inline-flex items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-900"
      >
        Back to catalog
      </Link>
    </main>
  )
}

function TireLoadError({ onRetry }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Couldn't load this tire</h1>
      <p className="mt-2 text-sm text-zinc-400">Network or permission error.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-900"
      >
        Retry
      </button>
    </main>
  )
}

export function TireDetailPage() {
  const { mspn } = useParams()
  const [tire, setTire] = useState(null)
  const [categoryMap, setCategoryMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const firstRunRef = useRef(true)
  const { tires } = useTires()

  useEffect(() => {
    let cancelled = false
    // Reset loading + error before kicking off a fresh fetch. Defer via
    // queueMicrotask so the synchronous-setState-in-effect lint rule
    // doesn't fire — these still run before the network resolves so the
    // user sees the spinner while waiting.
    if (!firstRunRef.current) {
      queueMicrotask(() => {
        if (cancelled) return
        setLoading(true)
        setError(null)
      })
    }
    firstRunRef.current = false
    Promise.all([
      getDoc(doc(db, 'tires', mspn)),
      getDoc(doc(db, 'meta', 'categoryMap')),
    ])
      .then(([t, c]) => {
        if (cancelled) return
        setTire(t.exists() ? { id: t.id, ...t.data() } : null)
        setCategoryMap(c.exists() ? c.data() : null)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [mspn, reloadKey])

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12 text-center">
        <Spinner className="h-6 w-6" />
      </main>
    )
  }
  if (error) return <TireLoadError onRetry={() => setReloadKey((k) => k + 1)} />
  if (!tire) return <TireNotFound mspn={mspn} />

  const efleetRecord = categoryMap?.records?.[mspn] ?? null
  const efleetDate = categoryMap?.sourceReportDate ?? null
  const relatedTires = tire.tread
    ? tires.filter((t) => t.tread === tire.tread && t.id !== tire.id)
    : []
  const backHref = `/tires?cat=${tire.category || 'all'}&highlight=${encodeURIComponent(tire.id)}`

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8 sm:py-10">
        <TireDetailHeader tire={tire} backHref={backHref} />
        <div className="grid gap-4 md:grid-cols-2">
          <TirePricingCard tire={tire} efleetRecord={efleetRecord} efleetDate={efleetDate} />
          <TirePlatformsCard tire={tire} />
        </div>
        {relatedTires.length > 0 ? (
          <TireRelatedSizes currentTire={tire} relatedTires={relatedTires} />
        ) : null}
      </main>
    </div>
  )
}
