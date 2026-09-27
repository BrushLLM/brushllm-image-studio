import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-ditch boundary so a render crash shows a recoverable card instead of
 * a blank white window.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ paddingTop: 48, maxWidth: 560 }}>
          <div className="card" style={{ textAlign: "center", padding: 36 }}>
            <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
            <p className="status-note" style={{ margin: "10px 0 20px", userSelect: "text" }}>
              {String(this.state.error?.message ?? this.state.error)}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <RotateCcw /> Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
