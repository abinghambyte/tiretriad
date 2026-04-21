import { httpsCallable } from 'firebase/functions'
import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { functions } from '../firebase/config.js'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/shared/EmptyState.jsx'
import { QueueRow } from '../components/queue/QueueRow.jsx'
import { useTires } from '../hooks/useTires.js'
import { useToast } from '../context/ToastContext.jsx'
import { useUserProfile } from '../hooks/useUserProfile.js'
import { selectOpenQueueRows } from '../utils/queueSelectors.js'

const resolveQueueItemCallable = httpsCallable(functions, 'resolveQueueItem')

export function MyQueuePage() {
  const { profile, loading: profileLoading } = useUserProfile()
  const role = String(profile?.role || '').toLowerCase()
  const allowed = role === 'sourcer' || role === 'admin'

  const { tires, loading: tiresLoading, error } = useTires()
  const { toast } = useToast()
  const [pendingIds, setPendingIds] = useState(/** @type {Set<string>} */ (new Set()))

  const rows = useMemo(() => {
    const open = selectOpenQueueRows(tires)
    if (pendingIds.size === 0) return open
    return open.filter((t) => !pendingIds.has(String(t.id)))
  }, [tires, pendingIds])

  if (!profileLoading && profile && !allowed) {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  async function handleResolve(tire, outcome, extras) {
    const tireId = String(tire?.id || '')
    if (!tireId) return
    try {
      await resolveQueueItemCallable({ tireId, outcome, ...(extras || {}) })
      if (outcome === 'retail-wrong') {
        toast('Retail updated and tire returned to catalog', 'success')
      } else if (outcome === 'confirm-archive') {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.add(tireId)
          return next
        })
        toast('Archived', 'success')
      } else if (outcome === 'punt') {
        toast('Punted for later', 'info')
      }
    } catch (err) {
      const msg = err?.message || 'Could not resolve queue item.'
      toast(msg, 'error')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="My Queue"
        subtitle={
          tiresLoading
            ? 'Loading verification queue…'
            : `${rows.length} tire${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} verification`
        }
        tabs={[]}
        maxWidthClass="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-900/55 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            Could not load the queue. {String(error.message || error)}
          </div>
        ) : null}

        {tiresLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Spinner className="h-8 w-8 text-zinc-500" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="New tires show up here after the nightly sweep or when teammates route them for research."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((tire) => (
              <QueueRow
                key={String(tire.id)}
                tire={tire}
                onResolve={(outcome, extras) => handleResolve(tire, outcome, extras)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
