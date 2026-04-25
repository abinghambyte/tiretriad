import { initSentry } from './sentry.js'
import { StrictMode } from 'react'

initSentry()

try {
  const t = localStorage.getItem('skedaddle-theme')
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'
} catch {
  document.documentElement.dataset.theme = 'dark'
}
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/providers/ToastProvider.jsx'
import { UserProfileProvider } from './components/providers/UserProfileProvider.jsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <UserProfileProvider>
          <ToastProvider>
            <App />
            <Analytics />
            <SpeedInsights />
          </ToastProvider>
        </UserProfileProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
