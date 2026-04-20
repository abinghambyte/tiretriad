import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
import { PortalChrome } from './components/layout/PortalChrome.jsx'
import Spinner from './components/ui/Spinner.jsx'
import { LandingPage } from './pages/LandingPage'
import { InvitePage } from './pages/InvitePage'
import { VipConciergePage } from './pages/VipConciergePage.jsx'
import { MechanicIntakePage } from './pages/MechanicIntakePage.jsx'
import { ProtectedRoute } from './routes/ProtectedRoute'

// Lazy-load everything behind the portal chrome. Pages use named exports,
// so each import() is mapped to a default for React.lazy.
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const CrmPage = lazy(() => import('./pages/CrmPage').then((m) => ({ default: m.CrmPage })))
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const GrowthLabPage = lazy(() =>
  import('./pages/GrowthLabPage').then((m) => ({ default: m.GrowthLabPage })),
)
const HandshakePage = lazy(() =>
  import('./pages/HandshakePage').then((m) => ({ default: m.HandshakePage })),
)
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const OpsPage = lazy(() => import('./pages/OpsPage').then((m) => ({ default: m.OpsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const PeoplePage = lazy(() => import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const TiresPage = lazy(() => import('./pages/TiresPage').then((m) => ({ default: m.TiresPage })))

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-zinc-500" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/i/:token" element={<InvitePage />} />
      <Route path="/vip/:token" element={<VipConciergePage />} />
      <Route path="/intake/mechanic" element={<MechanicIntakePage />} />
      <Route
        element={
          <ErrorBoundary>
            <PortalChrome />
          </ErrorBoundary>
        }
      >
        <Route
          path="/handshake"
          element={
            <ProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <HandshakePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <DashboardPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/growth"
          element={
            <ProtectedRoute requireAdmin>
              <Suspense fallback={<RouteFallback />}>
                <GrowthLabPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tires"
          element={
            <ProtectedRoute module="tires" level="view">
              <Suspense fallback={<RouteFallback />}>
                <TiresPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute module="orders" level="view">
              <Suspense fallback={<RouteFallback />}>
                <OrdersPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/wall" element={<Navigate to="/analytics?tab=wall" replace />} />
        <Route path="/contacts" element={<Navigate to="/people?tab=customers" replace />} />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute module="analytics" level="view">
              <Suspense fallback={<RouteFallback />}>
                <AnalyticsPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/people"
          element={
            <ProtectedRoute module="people" level="manage">
              <Suspense fallback={<RouteFallback />}>
                <PeoplePage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ops"
          element={
            <ProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <OpsPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <Suspense fallback={<RouteFallback />}>
                <AdminPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <ProtectedRoute module="crm" level="view">
              <Suspense fallback={<RouteFallback />}>
                <CrmPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/crm/dispatch" element={<Navigate to="/crm?tab=dispatch" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
