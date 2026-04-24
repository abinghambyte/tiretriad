import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SinchChatMount } from '../components/chat/SinchChatMount.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { functions } from '../firebase/config'

const verifyVipLinkFn = httpsCallable(functions, 'verifyVipLink')

export function VipConciergePage() {
  const { token: rawToken } = useParams()
  const token = String(rawToken || '').trim()
  const hasToken = token.length > 0

  const [phase, setPhase] = useState(() => (hasToken ? 'verifying' : 'invalid'))
  const [account, setAccount] = useState(null)
  const [chatStarted, setChatStarted] = useState(false)

  useEffect(() => {
    if (!hasToken) return undefined

    let cancelled = false
    ;(async () => {
      try {
        const res = await verifyVipLinkFn({ token })
        const d = res.data
        if (cancelled) return
        if (d?.ok && d.account?.id) {
          setAccount(d.account)
          setPhase('ready')
        } else {
          setPhase('invalid')
        }
      } catch {
        if (!cancelled) setPhase('invalid')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasToken, token])

  const vipCtx = useMemo(() => {
    if (!account) return null
    return {
      accountId: account.id,
      displayName: account.displayName,
      tier: account.tier,
    }
  }, [account])

  const onStartChat = useCallback(() => {
    setChatStarted(true)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-12">
        {phase === 'verifying' ? (
          <div className="flex flex-col items-center gap-3 text-sm text-zinc-400">
            <Spinner className="h-8 w-8 text-amber-400/90" />
            <h1 className="m-0 text-sm font-medium text-zinc-200">Verifying VIP access…</h1>
          </div>
        ) : null}

        {phase === 'invalid' ? (
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl shadow-black/40">
            <h1 className="text-lg font-semibold text-zinc-100">Link unavailable</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              This VIP link is no longer valid. Contact support if you received this link and it should still work.
            </p>
          </div>
        ) : null}

        {phase === 'ready' && account && !chatStarted ? (
          <div className="w-full space-y-6">
            <div className="rounded-2xl border border-amber-500/25 bg-zinc-900/80 p-6 text-center shadow-xl shadow-black/40">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Welcome to VIP concierge</h1>
              <p className="mt-2 text-sm text-zinc-400">{account.displayName}</p>
              <button
                type="button"
                onClick={onStartChat}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
              >
                Start chat
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'ready' && account && chatStarted && vipCtx ? (
          <div className="w-full space-y-4">
            <p className="text-center text-sm text-zinc-400">Chat with our team below.</p>
            <SinchChatMount vipMode vipContext={vipCtx} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
