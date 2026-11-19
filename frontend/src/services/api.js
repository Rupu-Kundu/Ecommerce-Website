import axios from 'axios'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStorage'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

// Central Axios client used by every service.
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the JWT access token to every request automatically.
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Automatic token refresh ---

// Called when the session can't be recovered (refresh failed). AuthContext sets this.
let onSessionExpired = () => {}
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

// Share one refresh request between all calls that fail at the same moment.
let refreshPromise = null

export async function refreshAccessToken() {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error('No refresh token')

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh/`, { refresh })
      .then(({ data }) => {
        setTokens(data) // backend rotates: new access + new refresh
        return data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const NO_REFRESH_URLS = ['/auth/login/', '/auth/register/', '/auth/refresh/']

// If a request fails with 401, try once to get a new access token and repeat it.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const skip = NO_REFRESH_URLS.some((url) => original?.url?.includes(url))

    if (status === 401 && original && !original._retry && !skip && getRefreshToken()) {
      original._retry = true
      try {
        const newAccess = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      } catch (refreshError) {
        clearTokens()
        onSessionExpired()
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  },
)

// Turn any API error into a readable message.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error?.response) {
    return 'Cannot reach the server. Please check your connection.'
  }
  const data = error.response.data
  if (typeof data === 'string') return fallback
  if (data?.detail) return data.detail
  if (Array.isArray(data?.non_field_errors)) return data.non_field_errors.join(' ')
  return fallback
}

export default api
