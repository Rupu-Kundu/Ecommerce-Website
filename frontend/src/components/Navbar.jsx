import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../context/useAuth'

const linkClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
  }`

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  const closeMenu = () => setMenuOpen(false)

  async function handleLogout() {
    closeMenu()
    await logout()
    navigate('/')
  }

  const navLinks = (
    <>
      <NavLink to="/" end className={linkClass} onClick={closeMenu}>
        Home
      </NavLink>
      <NavLink to="/products" className={linkClass} onClick={closeMenu}>
        Products
      </NavLink>
    </>
  )

  const authLinks = isAuthenticated ? (
    <>
      <span className="block px-3 py-2 text-sm text-slate-600">
        Hi, <span className="font-semibold text-slate-900">{user.username}</span>
        {user.role === 'admin' && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Admin</span>
        )}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 md:w-auto"
      >
        Logout
      </button>
    </>
  ) : (
    <>
      <NavLink to="/login" className={linkClass} onClick={closeMenu}>
        Login
      </NavLink>
      <Link
        to="/register"
        onClick={closeMenu}
        className="block rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Register
      </Link>
    </>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-indigo-700" onClick={closeMenu}>
          ShopEase
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">{navLinks}</div>
        <div className="hidden items-center gap-2 md:flex">{authLinks}</div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">
          {navLinks}
          <div className="my-2 border-t border-slate-100" />
          {authLinks}
        </div>
      )}
    </header>
  )
}
