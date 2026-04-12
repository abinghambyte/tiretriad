import { StrictMode } from 'react'

try {
  const t = localStorage.getItem('skedaddle-theme')
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'
} catch {
  document.documentElement.dataset.theme = 'dark'
}
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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
          </ToastProvider>
        </UserProfileProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
