import { Component } from "react";

/**
 * Render failures degrade to a sentence, not a blank page. The default fallback fills the screen
 * (router root); pass `inline` for a contained surface like the run sheet, so one malformed payload
 * breaks only its own card.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("render error", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.inline) {
      return (
        <div className="p-6 sm:p-8" data-testid="run-sheet-error">
          <p className="text-zinc-100 leading-relaxed">This run's details couldn't be drawn. The rest of the page still works.</p>
          <button className="rp-btn-ghost mt-4" onClick={() => this.setState({ error: null })} data-testid="run-sheet-error-retry">
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="rp-card p-8 max-w-md text-center" data-testid="error-boundary-card">
          <p className="text-zinc-100 leading-relaxed mb-6">Something broke while drawing this page. Your checks and their history are fine.</p>
          <button className="rp-btn-primary justify-center w-full" onClick={() => window.location.reload()} data-testid="error-boundary-reload">
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
