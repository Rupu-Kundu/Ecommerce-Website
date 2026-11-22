import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ActiveBadge, Avatar } from '../../components/admin/CustomerBits'
import ErrorMessage from '../../components/ErrorMessage'
import Pagination from '../../components/Pagination'
import { getAdminCustomers } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatDate, formatPrice } from '../../utils/format'

const PAGE_SIZE = 12 // the API's page size
const SEARCH_DELAY = 300

const FILTERS = [
  { key: 'status', label: 'Status', options: [['', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive']] },
  { key: 'orders', label: 'Orders', options: [['', 'Any orders'], ['with', 'Has ordered'], ['without', 'No orders yet']] },
  { key: 'joined', label: 'Joined', options: [['', 'Joined any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] },
  {
    key: 'ordering',
    label: 'Sort by',
    options: [['', 'Newest first'], ['oldest', 'Oldest first'], ['spent', 'Most spent'], ['orders', 'Most orders'], ['recent_order', 'Recent order'], ['name', 'Username A–Z']],
  },
]

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]'
const select = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100'

function SummaryChip({ label, value, testId }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900" data-testid={testId}>{value}</p>
    </div>
  )
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="Loading customers" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <span className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
          <span className="h-4 flex-1 animate-pulse rounded bg-slate-200" />
          <span className="hidden h-4 w-24 animate-pulse rounded bg-slate-200 sm:block" />
        </div>
      ))}
    </div>
  )
}

export default function AdminCustomersPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('search') || ''
  const filters = Object.fromEntries(FILTERS.map((f) => [f.key, params.get(f.key) || '']))

  const [searchInput, setSearchInput] = useState(search)
  const [syncedSearch, setSyncedSearch] = useState(search)
  if (search !== syncedSearch) {
    // URL changed from outside (back button, "Clear filters") → show it in the box
    setSyncedSearch(search)
    setSearchInput(search)
  }

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const queryJson = JSON.stringify({ search, ...filters, page })
  const requestKey = `${queryJson}#${reloadKey}`
  const [settledKey, setSettledKey] = useState(null)
  const loading = settledKey !== requestKey

  // React Router applies URL changes in a transition, so two quick changes (e.g. two filters
  // in a row) could each start from the old URL and undo each other. Build every change on
  // top of the newest URL we asked for; drop that copy once the router has caught up.
  const pendingParams = useRef(null)
  useEffect(() => {
    pendingParams.current = null
  }, [params])

  function update(changes, { resetPage = true } = {}) {
    const next = new URLSearchParams(pendingParams.current ?? params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (resetPage) next.delete('page')
    pendingParams.current = next
    setParams(next, { replace: true })
  }

  // Search as you type (debounced) — the URL is the source of truth.
  useEffect(() => {
    if (searchInput.trim() === search) return undefined
    const t = setTimeout(() => {
      setSyncedSearch(searchInput.trim())
      update({ search: searchInput.trim() })
    }, SEARCH_DELAY)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    const key = `${queryJson}#${reloadKey}`
    getAdminCustomers(JSON.parse(queryJson))
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404 && page > 1) update({ page: '' }) // page no longer exists
        else setError(getErrorMessage(err, 'Could not load customers.'))
      })
      .finally(() => !cancelled && setSettledKey(key))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryJson, reloadKey])

  const hasFilters = Boolean(search || FILTERS.some((f) => filters[f.key] && f.key !== 'ordering'))
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  return (
    <div className="space-y-5">
      {/* Summary (whole customer base, not filtered) */}
      {data?.summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryChip label="Customers" value={data.summary.total.toLocaleString('en-US')} testId="sum-total" />
          <SummaryChip label="Active accounts" value={data.summary.active.toLocaleString('en-US')} testId="sum-active" />
          <SummaryChip label="Have ordered" value={data.summary.with_orders.toLocaleString('en-US')} testId="sum-ordered" />
          <SummaryChip label="New (30 days)" value={data.summary.new_last_30_days.toLocaleString('en-US')} testId="sum-new" />
        </div>
      )}

      <section className={card} aria-labelledby="customers-heading">
        {/* Filters: one row above the list */}
        <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="customers-heading" className="text-lg font-bold text-slate-900">
              All customers{' '}
              {data && <span className="text-sm font-medium text-slate-500" data-testid="customer-count">({data.count.toLocaleString('en-US')} {hasFilters ? 'found' : 'total'})</span>}
            </h2>
            {hasFilters && (
              <button type="button" onClick={() => update({ search: '', status: '', orders: '', joined: '' })} className="text-sm font-semibold text-brand-700 hover:underline">
                Clear filters
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <label htmlFor="customer-search" className="sr-only">Search customers</label>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="customer-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, username, email or phone…"
                maxLength={100}
                className={`${select} pl-9`}
              />
            </div>
            {FILTERS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`filter-${f.key}`} className="sr-only">{f.label}</label>
                <select id={`filter-${f.key}`} value={filters[f.key]} onChange={(e) => update({ [f.key]: e.target.value })} className={select}>
                  {f.options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* List */}
        {!data && loading ? (
          <RowsSkeleton />
        ) : !data && error ? (
          <div className="p-5"><ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} /></div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error && (
              <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline">Try again</button>
              </div>
            )}
            {data.results.length === 0 ? (
              <div className="px-5 py-14 text-center" data-testid="customers-empty">
                <p className="font-semibold text-slate-900">{hasFilters ? 'No customers match these filters' : 'No customers yet'}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {hasFilters ? 'Try a different search or clear the filters.' : 'Customers appear here as soon as they register.'}
                </p>
              </div>
            ) : (
              <>
                {/* Table on wider screens */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm" data-testid="customers-table">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Customer</th>
                        <th className="px-3 py-3 font-semibold">Phone</th>
                        <th className="px-3 py-3 text-right font-semibold">Orders</th>
                        <th className="px-3 py-3 text-right font-semibold">Total spent</th>
                        <th className="px-3 py-3 font-semibold">Last order</th>
                        <th className="px-3 py-3 font-semibold">Joined</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.results.map((c) => (
                        <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin-dashboard/customers/${c.id}`)} data-testid="customer-row">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.full_name || c.username} />
                              <div className="min-w-0">
                                <Link to={`/admin-dashboard/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-brand-700">
                                  {c.full_name || c.username}
                                </Link>
                                <p className="truncate text-xs text-slate-500">@{c.username} · {c.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{c.phone || '—'}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{c.orders_count}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPrice(c.total_spent)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{c.last_order_at ? formatDate(c.last_order_at) : <span className="text-slate-400">Never</span>}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(c.date_joined)}</td>
                          <td className="px-5 py-3"><ActiveBadge active={c.is_active} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Cards on phones and tablets */}
                <ul className="divide-y divide-slate-100 lg:hidden" data-testid="customers-cards">
                  {data.results.map((c) => (
                    <li key={c.id}>
                      <Link to={`/admin-dashboard/customers/${c.id}`} className="flex items-start gap-3 px-4 py-4 hover:bg-slate-50">
                        <Avatar name={c.full_name || c.username} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-semibold text-slate-900">{c.full_name || c.username}</p>
                            <ActiveBadge active={c.is_active} />
                          </div>
                          <p className="truncate text-xs text-slate-500">@{c.username} · {c.email}</p>
                          <p className="mt-1.5 text-xs text-slate-600">
                            <span className="font-semibold text-slate-900">{c.orders_count}</span> orders ·{' '}
                            <span className="font-semibold text-slate-900">{formatPrice(c.total_spent)}</span> spent · joined {formatDate(c.date_joined)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="px-4 pb-5">
              <Pagination page={page} totalPages={totalPages} onChange={(p) => update({ page: p > 1 ? String(p) : '' }, { resetPage: false })} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
