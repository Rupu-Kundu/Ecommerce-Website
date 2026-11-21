import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../context/authContext'
import ProtectedRoute from './ProtectedRoute'

function renderAt(path, auth, adminOnly = false) {
  const value = { initializing: false, isAuthenticated: false, isAdmin: false, ...auth }
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
          <Route element={<ProtectedRoute adminOnly={adminOnly} />}>
            <Route path="/secret" element={<p>Secret page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('sends guests to /login', () => {
    renderAt('/secret', {})
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
  it('lets logged-in users in', () => {
    renderAt('/secret', { isAuthenticated: true })
    expect(screen.getByText('Secret page')).toBeInTheDocument()
  })
  it('sends customers away from admin-only pages', () => {
    renderAt('/secret', { isAuthenticated: true }, true)
    expect(screen.getByText('Home page')).toBeInTheDocument()
  })
  it('lets admins into admin-only pages', () => {
    renderAt('/secret', { isAuthenticated: true, isAdmin: true }, true)
    expect(screen.getByText('Secret page')).toBeInTheDocument()
  })
  it('waits while the session is being restored', () => {
    renderAt('/secret', { initializing: true })
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
  })
})
