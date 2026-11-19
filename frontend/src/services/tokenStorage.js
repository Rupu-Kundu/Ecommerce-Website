// Where JWT tokens live.
//
// - Access token: kept in memory only (a module variable). It is short-lived (30 min)
//   and never written to localStorage, so a page script can't read it from storage.
// - Refresh token: kept in localStorage so the user stays logged in after a page reload.
//   It is rotated on every refresh and blacklisted on logout by the backend.

const REFRESH_KEY = 'refresh_token'

let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setTokens({ access, refresh }) {
  if (access) accessToken = access
  if (refresh) {
    try {
      localStorage.setItem(REFRESH_KEY, refresh)
    } catch {
      // Storage unavailable (e.g. private mode): user just won't stay logged in after reload.
    }
  }
}

export function clearTokens() {
  accessToken = null
  try {
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // ignore
  }
}
