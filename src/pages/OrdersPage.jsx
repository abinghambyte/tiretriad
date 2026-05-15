import { Link, useSearchParams } from 'react-router-dom'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import { OrdersList } from '../components/orders/OrdersList'

export function OrdersPage() {
  const [params] = useSearchParams()
  const highlight = params.get('highlight')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Tire orders"
        subtitle="Notify the customer and mark paid here. Slack drives the sourcer-to-field handoff."
        tabs={[]}
        maxWidthClass="max-w-6xl"
      />

      <main className="mx-auto max-w-6xl space-y-4 px-6 py-8 sm:py-10">
        <p className="text-sm text-zinc-400">
          Primary entry:{' '}
          <Link
            to="/tires?tab=orders"
            className="text-amber-300 underline-offset-2 hover:underline"
          >
            Tire Triad Tires → Orders
          </Link>
          .
        </p>
        <OrdersList highlightId={highlight} />
      </main>
    </div>
  )
}
