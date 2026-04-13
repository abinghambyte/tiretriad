import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalChrome } from './components/layout/PortalChrome.jsx'
import { ContactsPage } from './pages/ContactsPage'
import { CrmDispatchPage } from './pages/CrmDispatchPage'
import { CrmPage } from './pages/CrmPage'
import { DashboardPage } from './pages/DashboardPage'
import { HandshakePage } from './pages/HandshakePage'
import { InvitePage } from './pages/InvitePage'
import { MechanicIntakePage } from './pages/MechanicIntakePage.jsx'
import { LandingPage } from './pages/LandingPage'
import { OrdersPage } from './pages/OrdersPage'
import { PeoplePage } from './pages/PeoplePage'
import { TiresPage } from './pages/TiresPage'
import { WallPage } from './pages/WallPage'
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
        <Route
          path="/wall"
          element={
            <ProtectedRoute module="wall" level="view">
              <WallPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute module="orders" level="view">
              <ContactsPage />
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
