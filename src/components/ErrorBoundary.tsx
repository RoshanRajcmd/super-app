import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorText } from "../utils/crashOverlay";

/**
 * Catches a render-time throw and shows it.
 *
 * Without this, React unmounts the whole tree on an uncaught error and leaves an
 * empty page — indistinguishable, on a packaged APK, from the app never having
 * started. A class component because this is the one thing hooks cannot do.
 */

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Kept for the desktop and browser builds, where there is a console to
        // read it in. The overlay below is what the phone gets.
        console.error("Unhandled render error", error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (error === null) return this.props.children;

        return (
            <div className="crash-overlay">
                <strong>Something went wrong</strong>
                <pre className="crash-overlay-message">{errorText(error)}</pre>
                <button className="app-btn" onClick={() => this.setState({ error: null })}>
                    Try again
                </button>
            </div>
        );
    }
}
