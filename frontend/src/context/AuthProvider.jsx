import { useCallback, useEffect, useMemo, useState } from 'react'
import { refreshAccessToken, setSessionExpiredHandler } from '../services/api'
import { fetchCurrentUser, loginUser, logoutUser, registerUser } from '../services/authService'
import { clearTokens, getRefreshToken, setTokens } from '../services/tokenStorage'
import { AuthContext } from './authContext'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // True while we check for an existing session on first load.
  const [initializing, setInitializing] = useState(true)

  // On page load: if a refresh token exists, get a fresh access token and load the user.
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!getRefreshToken()) {
        setInitializing(false)
        return
      }
      try {
        await refreshAccessToken()
        const me = await fetchCurrentUser()
        if (!cancelled) setUser(me)
      } catch {
        clearTokens()
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  // If the API client can't refresh the token, the session is over.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await loginUser(username, password)
    setTokens(data)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await registerUser(payload)
    setTokens(data)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = getRefreshToken()
    try {
      if (refresh) await logoutUser(refresh) // blacklist on the server
    } catch {
      // Even if the server call fails, log out locally.
    } finally {
      clearTokens()
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
    }),
    [user, initializing, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
