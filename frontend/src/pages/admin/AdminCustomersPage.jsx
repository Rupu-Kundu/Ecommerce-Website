import { Link, useNavigate } from 'react-router-dom'
import { ActiveBadge, Avatar } from '../../components/admin/CustomerBits'
import { EmptyState, ErrorBanner, FilterSelect, ListSkeleton, SearchBox, SummaryChip } from '../../components/admin/ListControls'
import { cardClass } from '../../components/admin/styles'
import ErrorMessage from '../../components/ErrorMessage'
import Pagination from '../../components/Pagination'
import useApiData from '../../hooks/useApiData'
import useUrlFilters from '../../hooks/useUrlFilters'
import { getAdminCustomers } from '../../services/adminService'
import { formatDate, formatPrice } from '../../utils/format'

const PAGE_SIZE = 12 // the API's page size

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

export default function AdminCustomersPage() {
  const { values, page, update } = useUrlFilters(['search', ...FILTERS.map((f) => f.key)])
  const navigate = useNavigate()
  const search = values.search
  const filters = Object.fromEntries(FILTERS.map((f) => [f.key, values[f.key]]))
  const query = { search, ...filters, page }
  const { data, error, loading, reload } = useApiData(JSON.stringify(query), () => getAdminCustomers(query), 'Could not load customers.', (err) => {
    if (err.response?.status === 404 && page > 1) {
      update({ page: '' }) // page no longer exists
      return true
    }
    return false
  })

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

      <section className={cardClass} aria-labelledby="customers-heading">
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
            <div className="sm:col-span-2 lg:col-span-1">
              <SearchBox id="customer-search" label="Search customers" value={search} onSearch={(v) => update({ search: v })} placeholder="Search name, username, email or phone…" />
            </div>
            {FILTERS.map((f) => (
              <FilterSelect key={f.key} id={`filter-${f.key}`} label={f.label} value={filters[f.key]} options={f.options} onChange={(v) => update({ [f.key]: v })} />
            ))}
          </div>
        </div>

        {/* List */}
        {!data && loading ? (
          <ListSkeleton label="Loading customers" />
        ) : !data && error ? (
          <div className="p-5"><ErrorMessage message={error} onRetry={reload} /></div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error && <ErrorBanner message={error} onRetry={reload} />}
            {data.results.length === 0 ? (
              <EmptyState
                testId="customers-empty"
                title={hasFilters ? 'No customers match these filters' : 'No customers yet'}
                hint={hasFilters ? 'Try a different search or clear the filters.' : 'Customers appear here as soon as they register.'}
              />
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
              <Pagination page={page} totalPages={totalPages} onChange={(p) => update({ page: p > 1 ? p : '' }, { resetPage: false })} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
