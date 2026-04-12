import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const isDev = import.meta.env.DEV
      const msg = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-200">
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          {isDev ? (
            <p className="max-w-lg font-mono text-xs text-red-300/90">{msg}</p>
          ) : (
            <p className="max-w-md text-sm text-zinc-400">Please reload the page and try again.</p>
          )}
          <button
            type="button"
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
