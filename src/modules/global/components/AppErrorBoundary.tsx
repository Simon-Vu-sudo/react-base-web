import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Tier 3: sits outside RouterProvider, so it still renders when the router or
 * a provider is what failed. Without it those failures are a white screen.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: unknown }
> {
  state: { hasError: boolean; error: unknown } = { hasError: false, error: null }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[app] unrecoverable error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">The application failed to start</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <button className="mt-4 text-sm underline" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
