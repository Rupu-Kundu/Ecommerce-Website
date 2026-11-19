import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Loader from '../components/Loader'
import useAuth from '../context/useAuth'

/**
 * Wrap routes that need a logged-in user.
 *   <Route element={<ProtectedRoute />}> ...customer pages... </Route>
 *   <Route element={<ProtectedRoute adminOnly />}> ...admin pages... </Route>
 *
 * Guests are sent to /login (and returned here after logging in).
 * Logged-in non-admins trying an admin page are sent home.
 */
export default function ProtectedRoute({ adminOnly = false }) {
  const { isAuthenticated, isAdmin, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <Loader label="Checking your session..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
