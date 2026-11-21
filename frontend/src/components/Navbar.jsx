import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import useAuth from '../context/useAuth'
import useCart from '../context/useCart'
import { API_BASE_URL } from '../services/api'
import { getCategories } from '../services/productService'
import Logo from './Logo'

const DJANGO_ADMIN_URL = API_BASE_URL.replace(/\/api\/?$/, '/admin/')

const navLinkClass = ({ isActive }) =>
  `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

const mobileLinkClass = ({ isActive }) =>
  `block rounded-lg px-3 py-2.5 text-sm font-semibold ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
  }`

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    search: <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
    bag: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 21.75H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />,
    chevron: <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />,
    menu: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />,
    close: <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />,
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** Closes a dropdown when clicking outside it or pressing Escape. */
function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => ref.current && !ref.current.contains(e.target) && onClose()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref, onClose])
}

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [menuOpen, setMenuOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [categories, setCategories] = useState([])
  const categoriesRef = useRef(null)
  const profileRef = useRef(null)

  // Close every menu whenever the page changes (link click, back button, search...).
  const [lastLocationKey, setLastLocationKey] = useState(location.key)
  if (location.key !== lastLocationKey) {
    setLastLocationKey(location.key)
    setMenuOpen(false)
    setCategoriesOpen(false)
    setProfileOpen(false)
  }

  // Keep the search box in sync with ?search= on the products page.
  const urlSearch = location.pathname === '/products' ? searchParams.get('search') || '' : ''
  const [query, setQuery] = useState(urlSearch)
  const [syncedSearch, setSyncedSearch] = useState(urlSearch)
  if (urlSearch !== syncedSearch) {
    setSyncedSearch(urlSearch)
    setQuery(urlSearch)
  }

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  useDismiss(categoriesOpen, categoriesRef, () => setCategoriesOpen(false))
  useDismiss(profileOpen, profileRef, () => setProfileOpen(false))

  function handleSearch(event) {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products')
  }

  async function handleLogout() {
    setProfileOpen(false)
    setMenuOpen(false)
    await logout()
    navigate('/')
  }

  const searchForm = (id) => (
    <form onSubmit={handleSearch} role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">Search products</label>
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands, categories…"
        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
      />
    </form>
  )

  const cartLink = (
    <Link
      to="/cart"
      aria-label={`Cart, ${itemCount} items`}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-brand-700"
    >
      <Icon name="bag" className="h-6 w-6" />
      {itemCount > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-400 px-1 text-[11px] font-bold text-slate-900 ring-2 ring-white"
          data-testid="cart-count"
        >
          {itemCount}
        </span>
      )}
    </Link>
  )

  const initial = user?.username?.charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 lg:gap-6">
        <Link to="/" className="shrink-0 transition-opacity hover:opacity-85" aria-label="Haatbox home">
          <Logo />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 lg:flex">
          <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          <NavLink to="/products" className={navLinkClass}>Products</NavLink>
          <div className="relative" ref={categoriesRef}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={categoriesOpen}
              onClick={() => setCategoriesOpen((o) => !o)}
              className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                categoriesOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Categories
              <Icon name="chevron" className={`h-4 w-4 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`} />
            </button>
            {categoriesOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10" role="menu">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    to={`/products?category=${c.slug}`}
                    role="menuitem"
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    {c.name}
                  </Link>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <Link to="/products" role="menuitem" className="block rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  All products →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Desktop search */}
        <div className="hidden max-w-md flex-1 lg:block">{searchForm('nav-search')}</div>

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          {cartLink}

          {/* Desktop auth */}
          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  aria-label="Account menu"
                  onClick={() => setProfileOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition hover:border-brand-300 hover:shadow-sm"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{initial}</span>
                  <span className="max-w-32 truncate text-sm font-semibold text-slate-800">{user.username}</span>
                  <Icon name="chevron" className="h-4 w-4 text-slate-500" />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10" role="menu">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                      {isAdmin && (
                        <span className="mt-1.5 inline-block rounded-full bg-accent-300/40 px-2 py-0.5 text-[11px] font-bold text-amber-800">Admin</span>
                      )}
                    </div>
                    <div className="my-1 border-t border-slate-100" />
                    <Link to="/orders" role="menuitem" className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">My orders</Link>
                    <Link to="/cart" role="menuitem" className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">My cart</Link>
                    {isAdmin && (
                      <Link to="/admin-dashboard" role="menuitem" className="block rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">Admin dashboard</Link>
                    )}
                    {isAdmin && (
                      <a href={DJANGO_ADMIN_URL} target="_blank" rel="noreferrer" role="menuitem" className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        Admin panel ↗
                      </a>
                    )}
                    <button type="button" role="menuitem" onClick={handleLogout} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass}>Login</NavLink>
                <Link
                  to="/register"
                  className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 hover:shadow-md"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} className="h-6 w-6" />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-5 pt-4 lg:hidden">
          {searchForm('mobile-search')}
          <div className="mt-4 space-y-1">
            <NavLink to="/" end className={mobileLinkClass}>Home</NavLink>
            <NavLink to="/products" className={mobileLinkClass}>Products</NavLink>
            <NavLink to="/cart" className={mobileLinkClass}>Cart{itemCount > 0 && ` (${itemCount})`}</NavLink>
          </div>
          {categories.length > 0 && (
            <div className="mt-4">
              <p className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Categories</p>
              <div className="mt-2 flex flex-wrap gap-2 px-1">
                {categories.map((c) => (
                  <Link key={c.id} to={`/products?category=${c.slug}`} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            {isAuthenticated ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{initial}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>
                <NavLink to="/orders" className={mobileLinkClass}>My orders</NavLink>
                {isAdmin && <NavLink to="/admin-dashboard" className={mobileLinkClass}>Admin dashboard</NavLink>}
                {isAdmin && (
                  <a href={DJANGO_ADMIN_URL} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Admin panel ↗</a>
                )}
                <button type="button" onClick={handleLogout} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
                  Logout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to="/login" className="rounded-full border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Login</Link>
                <Link to="/register" className="rounded-full bg-brand-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-800">Register</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
