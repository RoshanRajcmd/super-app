import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'
import { installCrashOverlay } from './utils/crashOverlay'
import { applyShell } from './utils/shell'

// Both before the first render: the overlay so a failure during startup is shown
// rather than leaving a blank page, and the shell so the stylesheet knows which
// safe-area behaviour to expect without a reflow.
installCrashOverlay()
applyShell()

// Component-scoped stylesheets are imported by their own components.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
