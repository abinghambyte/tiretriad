import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { HandshakePage } from './pages/HandshakePage'
import { InvitePage } from './pages/InvitePage'
import { LandingPage } from './pages/LandingPage'
import { OrdersPage } from './pages/OrdersPage'
import { PeoplePage } from './pages/PeoplePage'
import { TiresPage } from './pages/TiresPage'
import { ProtectedRoute } from './routes/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/i/:token" element={<InvitePage />} />
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
        path="/people"
        element={
          <ProtectedRoute module="people" level="manage">
            <PeoplePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
