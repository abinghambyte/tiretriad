import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useUserProfile } from '../hooks/useUserProfile'
import { useTires } from '../hooks/useTires'
import { useEFleetDiff } from '../hooks/useEFleetDiff'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { AccountCard } from '../components/admin/efleet/AccountCard.jsx'
import { FetAuditTable } from '../components/admin/efleet/FetAuditTable.jsx'
import { EFleetDiffView } from '../components/admin/efleet/EFleetDiffView.jsx'

const TAB_KEYS = ['account', 'fet', 'diff']
const STATE_KEYS = ['mismatched', 'invOnly', 'eFleetOnly', 'aligned']

export function AdminEFleetPage() {
  const { profile, loading: profileLoading } = useUserProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'account'
  const state = STATE_KEYS.includes(searchParams.get('state')) ? searchParams.get('state') : 'mismatched'

  const { tires, loading: tiresLoading } = useTires()
  const [categoryMap, setCategoryMap] = useState(null)
  const [mapLoading, setMapLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'meta', 'categoryMap'))
        if (cancelled) return
        setCategoryMap(snap.exists() ? snap.data() : null)
      } catch (err) {
        console.error('AdminEFleetPage categoryMap read', err)
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const records = categoryMap?.records || {}
  const diff = useEFleetDiff(tires, records)

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  function setDiffState(next) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'diff')
    params.set('state', next)
    setSearchParams(params, { replace: true })
  }

  const loading = profileLoading || tiresLoading || mapLoading

  const tabs = [
    { key: 'account', label: 'Account', to: '/admin/efleet?tab=account' },
    { key: 'fet', label: 'FET audit', to: '/admin/efleet?tab=fet' },
    { key: 'diff', label: 'Diff', to: '/admin/efleet?tab=diff' },
  ].map((t) => ({ ...t, active: t.key === tab }))

  const showEmpty = !loading && (!categoryMap || !categoryMap.records)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="eFleet tools"
        subtitle="FET audit, inventory diff, and import metadata"
        tabs={tabs}
        maxWidthClass="max-w-6xl"
      />
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-8 sm:py-10">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner className="h-4 w-4" />
            Loading…
          </div>
        ) : showEmpty ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <p className="text-sm text-zinc-400">
              No eFleet import yet. Run <code className="font-mono text-cyan-300">node scripts/import-efleet.mjs</code> from a machine
              with `GOOGLE_APPLICATION_CREDENTIALS` set, then refresh this page.
            </p>
          </section>
        ) : tab === 'account' ? (
          <AccountCard categoryMap={categoryMap} diffCounts={diff.counts} />
        ) : tab === 'fet' ? (
          <FetAuditTable diff={diff} />
        ) : (
          <EFleetDiffView diff={diff} initialState={state} onStateChange={setDiffState} />
        )}
      </main>
    </div>
  )
}
