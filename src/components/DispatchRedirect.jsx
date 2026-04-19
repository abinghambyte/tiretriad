import { ModuleSubheader } from './layout/ModuleSubheader.jsx'

/**
 * Temporary in-portal stand-in for `/dispatch` until the standalone Workforce app is deployed.
 * (Previously replaced the window with WORKFORCE_URL — see `src/constants/externalUrls.ts`.)
 */
export function DispatchRedirect() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Task Dispatcher"
        subtitle="Standalone workforce app. Reconnecting soon."
        tabs={[]}
        maxWidthClass="max-w-2xl"
      />
      <main className="mx-auto flex max-w-2xl min-h-[calc(100dvh-12rem)] flex-col justify-center px-6 py-16 text-center sm:min-h-[calc(100vh-10rem)] sm:py-20">
        <p className="text-sm leading-relaxed text-zinc-400">
          Task Dispatcher is being extracted to a standalone application. This route will reconnect when the
          external deployment is live.
        </p>
      </main>
    </div>
  )
}
