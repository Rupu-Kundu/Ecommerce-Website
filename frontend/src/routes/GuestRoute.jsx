import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Loader from '../components/Loader'
import useAuth from '../context/useAuth'

/**
 * Login/Register are only for guests. A logged-in user is sent back to the page
 * they originally wanted (if a protected route sent them here), otherwise home.
 */
export default function GuestRoute() {
  const { isAuthenticated, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <Loader label="Checking your session..." />
  if (isAuthenticated) {
    const fromLocation = location.state?.from
    const from = fromLocation ? `${fromLocation.pathname}${fromLocation.search || ''}` : '/'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}
