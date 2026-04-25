import { formatCurrency } from '../../utils/format'

// eslint-disable-next-line no-unused-vars -- onToggleSelect reserved for Task 8 wiring
export function TireCardMobile({ tire, selected = false, onTestOffer, onToggleSelect }) {
  const ring = selected ? 'ring-2 ring-amber-500/70' : 'ring-1 ring-zinc-800'
  return (
    <div className={`rounded-xl bg-zinc-900 p-3 ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-zinc-100">
          {tire.description}
        </p>
        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
          {tire.mspn}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div><span className="text-zinc-400">Buy</span> <span className="font-mono text-zinc-100">{formatCurrency(tire.buy)}</span></div>
        <div><span className="text-zinc-400">Sell</span> <span className="font-mono text-zinc-100">{formatCurrency(tire.retail)}</span></div>
        <div><span className="text-zinc-400">Margin</span> <span className="font-mono text-emerald-300">{tire.marginPct}%</span></div>
        <div><span className="text-zinc-400">FET</span> <span className="font-mono text-zinc-300">{formatCurrency(tire.fet || 0)}</span></div>
        <div className="col-span-2"><span className="text-zinc-400">Listed</span> <span className="text-zinc-300">{tire.listedCount} platforms</span></div>
      </div>
      <button
        type="button"
        onClick={() => onTestOffer?.(tire)}
        className="mt-3 w-full min-h-[44px] rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
      >
        Test offer
      </button>
    </div>
  )
}
