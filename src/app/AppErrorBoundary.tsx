import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Tier 3: sits outside RouterProvider, so it still renders when the router or
 * a provider is what failed. Without it those failures are a white screen.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] unrecoverable error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">The application failed to start</h1>
        <p className="mt-2 text-sm text-slate-600">{this.state.error.message}</p>
        <button className="mt-4 text-sm underline" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
