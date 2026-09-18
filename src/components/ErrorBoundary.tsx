import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last line of defense against a blank screen: if anything throws during
 * render (e.g. a corrupted persisted snapshot), show a recovery screen with
 * a way to wipe local data instead of white nothingness.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  handleReset = (): void => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('ffl.') || key.startsWith('wkt.')) localStorage.removeItem(key)
      }
    } catch {
      // Storage unavailable — reload alone may still recover.
    }
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <main className="auth-shell">
        <div className="card auth-card stack">
          <h1>Something went wrong</h1>
          <p className="muted">
            The page hit an unexpected error — usually stale saved data from an older version.
            Resetting clears this browser&apos;s saved lottery and standings cache (not your
            account).
          </p>
          <code className="small">{this.state.error.message}</code>
          <button type="button" className="primary" onClick={this.handleReset}>
            Reset and reload
          </button>
        </div>
      </main>
    )
  }
}
