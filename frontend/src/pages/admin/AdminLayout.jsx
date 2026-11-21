import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/admin-dashboard', label: 'Overview', end: true },
  { to: '/admin-dashboard/products', label: 'Products' },
  { to: '/admin-dashboard/categories', label: 'Categories' },
  { to: '/admin-dashboard/orders', label: 'Orders' },
]

const tabClass = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
  }`

/** Shell for all admin pages (route is admin-only — see AppRouter). */
export default function AdminLayout() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Admin</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Dashboard</h1>
        </div>
        <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
