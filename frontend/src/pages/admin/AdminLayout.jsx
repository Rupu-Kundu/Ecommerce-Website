import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import AdminIcon from '../../components/admin/AdminIcon'
import Loader from '../../components/Loader'
import Logo from '../../components/Logo'
import useAuth from '../../context/useAuth'
import { getSupportSummary } from '../../services/supportService'

// Sidebar sections. `badge: 'chat'` shows the unread live-chat count.
const NAV = [
  { group: 'Overview', items: [{ to: '/admin-dashboard', label: 'Dashboard', icon: 'dashboard', end: true }] },
  {
    group: 'Sales',
    items: [{ to: '/admin-dashboard/orders', label: 'Orders', icon: 'orders' }],
  },
  {
    group: 'Catalog',
    items: [
      { to: '/admin-dashboard/products', label: 'Products', icon: 'products' },
      { to: '/admin-dashboard/categories', label: 'Categories', icon: 'categories' },
    ],
  },
  {
    group: 'Customers',
    items: [
      { to: '/admin-dashboard/customers', label: 'Customers', icon: 'customers' },
      { to: '/admin-dashboard/chat', label: 'Live chat', icon: 'chat', badge: 'chat' },
    ],
  },
]

const ALL_ITEMS = NAV.flatMap((g) => g.items)
const SUMMARY_POLL = 15000

function pageTitle(pathname) {
  const match = [...ALL_ITEMS].sort((a, b) => b.to.length - a.to.length).find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  return match?.label || 'Dashboard'
}

function Sidebar({ unread, onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-brand-950 text-brand-100">
      <div className="flex h-16 shrink-0 items-center gap-2 px-5">
        <Link to="/admin-dashboard" onClick={onNavigate} aria-label="Haatbox admin home">
          <Logo variant="light" />
        </Link>
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-200">Admin</span>
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-brand-300/70">{section.group}</p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-100/90 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <AdminIcon name={item.icon} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge === 'chat' && unread > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white" data-testid="admin-chat-badge">{unread}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-100/90 hover:bg-white/10 hover:text-white">
          <AdminIcon name="store" />
          View store
        </Link>
      </div>
    </div>
  )
}

function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user?.username || 'Admin'
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Admin account menu"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <AdminIcon name="chevron" className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <Link to="/" role="menuitem" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <AdminIcon name="store" className="h-4 w-4" /> View store
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <AdminIcon name="logout" className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  )
}

/** Full-screen admin shell: sidebar navigation + top bar (route is admin-only — see AppRouter). */
export default function AdminLayout() {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  const [unread, setUnread] = useState(0)
  const title = pageTitle(pathname)

  // Close the mobile drawer whenever the page changes.
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setDrawerOpen(false)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${title} · Haatbox Admin`
  }, [pathname, title])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Unread customer messages for the Live chat badge (also marks the team as online).
  useEffect(() => {
    const load = () => getSupportSummary().then((s) => setUnread(s.unread)).catch(() => {})
    load()
    const id = setInterval(() => !document.hidden && load(), SUMMARY_POLL)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar unread={unread} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl" data-testid="admin-drawer">
            <Sidebar unread={unread} onNavigate={() => setDrawerOpen(false)} />
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-brand-100 hover:bg-white/10">
              <AdminIcon name="close" />
            </button>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open admin menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
            <AdminIcon name="menu" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-medium text-slate-500 sm:block">Haatbox Admin</p>
            <h1 className="truncate text-lg font-bold leading-tight text-slate-900" data-testid="admin-title">{title}</h1>
          </div>
          <Link
            to="/admin-dashboard/chat"
            aria-label={unread > 0 ? `${unread} unread chat messages` : 'Live chat'}
            className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
          >
            <AdminIcon name="bell" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
          </Link>
          <AccountMenu />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Suspense fallback={<Loader label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
