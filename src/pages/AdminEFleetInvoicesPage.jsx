import { Navigate } from 'react-router-dom'
import { useUserProfile } from '../hooks/useUserProfile'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { InvoiceImportPanel } from '../components/admin/efleet/InvoiceImportPanel.jsx'
import { InvoiceLineReviewQueue } from '../components/admin/efleet/InvoiceLineReviewQueue.jsx'

export function AdminEFleetInvoicesPage() {
  const { profile, loading: profileLoading } = useUserProfile()

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="eFleet invoices"
        subtitle="Import Michelin invoices and reconcile lines against portal orders"
        tabs={[]}
        maxWidthClass="max-w-5xl"
      />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8 sm:py-10">
        {profileLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner className="h-4 w-4" />
            Loading...
          </div>
        ) : (
          <>
            <InvoiceImportPanel />
            <InvoiceLineReviewQueue />
          </>
        )}
      </main>
    </div>
  )
}
