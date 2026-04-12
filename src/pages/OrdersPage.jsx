import { Link, useSearchParams } from 'react-router-dom'
import { OrdersList } from '../components/orders/OrdersList'

export function OrdersPage() {
  const [params] = useSearchParams()
  const highlight = params.get('highlight')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/90 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link
            to="/dashboard"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
          >
            ← Dashboard
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Fleet ops
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
              Tire orders
            </h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-500">
              Slack drives Kyle → DJ workflow. Here: notify the customer (SMS app) and mark
              complete when paid. Primary entry:{' '}
              <Link to="/tires?tab=orders" className="text-amber-300/90 underline-offset-2 hover:underline">
                Skedaddle Tires → Orders
              </Link>
              .
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <OrdersList highlightId={highlight} />
      </main>
    </div>
  )
}
