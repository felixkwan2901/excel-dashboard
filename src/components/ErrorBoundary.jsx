import { Component } from 'react'

// React unmounts the entire tree on an uncaught render error by default —
// with no boundary, that's a silently blank page below whatever static
// background CSS happens to already be painted, with no way to recover
// short of the browser's own reload. This catches it and offers a
// one-click way back in instead.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in app render:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page-plane p-6 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Something went wrong</h1>
          <p className="max-w-md text-sm text-text-muted">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-[#06210a] transition-colors hover:bg-brand-green/90"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
