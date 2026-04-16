import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalChrome } from './components/layout/PortalChrome.jsx'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CrmDispatchPage } from './pages/CrmDispatchPage'
import { CrmPage } from './pages/CrmPage'
import { DashboardPage } from './pages/DashboardPage'
import { GrowthLabPage } from './pages/GrowthLabPage'
import { TaskDispatcherPage } from './pages/TaskDispatcher'
import { HandshakePage } from './pages/HandshakePage'
import { InvitePage } from './pages/InvitePage'
import { MechanicIntakePage } from './pages/MechanicIntakePage.jsx'
import { LandingPage } from './pages/LandingPage'
import { OrdersPage } from './pages/OrdersPage'
import { OpsPage } from './pages/OpsPage'
import { PeoplePage } from './pages/PeoplePage'
import { TiresPage } from './pages/TiresPage'
import { ProtectedRoute } from './routes/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/i/:token" element={<InvitePage />} />
      <Route path="/intake/mechanic" element={<MechanicIntakePage />} />
      <Route element={<PortalChrome />}>
        <Route
          path="/handshake"
          element={
            <ProtectedRoute>
              <HandshakePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/growth"
          element={
            <ProtectedRoute requireAdmin>
              <GrowthLabPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch"
          element={
            <ProtectedRoute requireAdmin>
              <TaskDispatcherPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tires"
          element={
            <ProtectedRoute module="tires" level="view">
              <TiresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute module="orders" level="view">
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route path="/wall" element={<Navigate to="/analytics?tab=wall" replace />} />
        <Route path="/contacts" element={<Navigate to="/people?tab=customers" replace />} />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute module="analytics" level="view">
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/people"
          element={
            <ProtectedRoute module="people" level="manage">
              <PeoplePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ops"
          element={
            <ProtectedRoute>
              <OpsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <ProtectedRoute module="crm" level="view">
              <CrmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/dispatch"
          element={
            <ProtectedRoute module="crm" level="view">
              <CrmDispatchPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
