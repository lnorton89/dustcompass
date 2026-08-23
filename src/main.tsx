import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './map/worker'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'

// The offline app updates its service worker automatically. Reload an existing
// tab when that worker takes control so an old map UI cannot linger indefinitely.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
