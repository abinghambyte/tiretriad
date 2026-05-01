import { httpsCallable } from 'firebase/functions'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { functions, firebaseProjectId } from '../firebase/config'
import { useToast } from '../context/ToastContext.jsx'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { AuditLogPanel } from '../components/admin/AuditLogPanel.jsx'
import { useUserProfile } from '../hooks/useUserProfile'

const runTirePriceResearchNow = httpsCallable(functions, 'runTirePriceResearchNow')

export function AdminPage() {
  const { profile, loading: profileLoading } = useUserProfile()
  const { toast } = useToast()

  const [priceResearchBusy, setPriceResearchBusy] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1'
  const inboundSmsUrl = `https://${region}-${firebaseProjectId}.cloudfunctions.net/inboundSms`

  async function runPriceResearch() {
    setPriceResearchBusy(true)
    try {
      await runTirePriceResearchNow({})
      toast('Price research run complete. Check #fleet-ops Slack for details.', 'success')
    } catch (err) {
      const msg = err?.message || 'Price research failed.'
      toast(msg, 'error')
    } finally {
      setPriceResearchBusy(false)
    }
  }

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Admin"
        subtitle="Infrastructure and integration settings"
        tabs={[]}
        maxWidthClass="max-w-6xl"
      />

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 sm:py-12">
        {/* Growth Lab discoverability link — patch-302. The /growth route
            stays out of the main nav (admin-only experimental tools) but
            this card surfaces it to admins who land on /admin. */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Growth Lab</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Experimental tools and admin-only sandbox: task dispatcher, session notes, and ad-hoc admin
            playgrounds. Not in the main nav by design.
          </p>
          <Link
            to="/growth"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-amber-600/40 hover:bg-zinc-800/80 sm:min-h-0"
          >
            Open Growth Lab →
          </Link>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">eFleet tools</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Account info, FET audit, and side-by-side diff against the latest <code className="font-mono text-cyan-300">meta/categoryMap</code> import.
            Read-only diagnostic view; surfaces mismatches operators should reconcile before the next eFleet run.
          </p>
          <Link
            to="/admin/efleet"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-amber-600/40 hover:bg-zinc-800/80 sm:min-h-0"
          >
            Open eFleet tools →
          </Link>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Price research</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Runs the wholesale-price check against up to 100 tires. Same job that runs nightly at 2 AM; use this to
            test the job or to pull a fresh batch on demand.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Writes only to the price intel fields. Tires with a confirmed buy price are skipped. Large deltas (more
            than 15%) are flagged in Slack for review rather than accepted automatically.
          </p>
          <button
            type="button"
            onClick={() => void runPriceResearch()}
            disabled={priceResearchBusy}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {priceResearchBusy && <Spinner className="h-4 w-4 text-zinc-800" />}
            {priceResearchBusy ? 'Running price research…' : 'Run price research now'}
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Inbound SMS (Sinch)</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Configure the Sinch <span className="text-zinc-300">incoming SMS</span> webhook URL to this endpoint after
            deploy. Replies post to #fleet-ops with a Slack <span className="text-zinc-300">Reply</span> button (uses
            existing Slack interactivity + Sinch outbound).
          </p>
          <div className="mt-3">
            {showWebhook ? (
              <code className="break-all font-mono text-xs text-cyan-300/90">{inboundSmsUrl}</code>
            ) : (
              <button
                type="button"
                onClick={() => setShowWebhook(true)}
                className="text-xs text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200"
              >
                Show webhook URL
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Optional: set a shared secret and send a matching Authorization header.
          </p>
        </section>

        <AuditLogPanel />
      </main>
    </div>
  )
}
