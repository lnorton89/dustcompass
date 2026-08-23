import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './map/worker'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
