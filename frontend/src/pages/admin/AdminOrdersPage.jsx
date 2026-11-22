import { useEffect, useState } from 'react'
import { EmptyState, ErrorBanner, FilterSelect, ListSkeleton, SearchBox } from '../../components/admin/ListControls'
import { cardClass } from '../../components/admin/styles'
import ErrorMessage from '../../components/ErrorMessage'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import Pagination from '../../components/Pagination'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import useApiData from '../../hooks/useApiData'
import useUrlFilters from '../../hooks/useUrlFilters'
import { getAdminOrders, getAdminStats, updateOrderStatus } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatDate, formatPrice } from '../../utils/format'
import OrderDrawer from './OrderDrawer'
import OrderStatusControl from './OrderStatusControl'

const PAGE_SIZE = 12
const STATUS_TABS = ['', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
const KEYS = ['status', 'search', 'payment_method', 'payment_status', 'days', 'ordering']
const label = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All')

export default function AdminOrdersPage() {
  const { values, page, update } = useUrlFilters([...KEYS, 'order'])
  const query = { ...Object.fromEntries(KEYS.map((k) => [k, values[k]])), page }
  const { data, setData, error, loading, reload } = useApiData(JSON.stringify(query), () => getAdminOrders(query), 'Could not load orders.', (err) => {
    if (err.response?.status === 404 && page > 1) {
      update({ page: '' })
      return true
    }
    return false
  })
  const [counts, setCounts] = useState(null)
  const [countsKey, setCountsKey] = useState(0)
  const [rowMessage, setRowMessage] = useState({}) // {orderId: {type, text}}
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    getAdminStats(7).then((s) => setCounts({ ...s.orders_by_status, all: s.order_count })).catch(() => setCounts(null))
  }, [countsKey])

  function applyUpdated(updated) {
    setData((d) => (d ? { ...d, results: d.results.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)) } : d))
    setCountsKey((k) => k + 1)
  }

  async function changeStatus(order, newStatus) {
    setSavingId(order.id)
    try {
      const updated = await updateOrderStatus(order.id, newStatus)
      applyUpdated(updated)
      setRowMessage((m) => ({ ...m, [order.id]: { type: 'ok', text: updated.payment_method === 'cod' && newStatus === 'delivered' ? 'Delivered · cash collected' : `Updated to ${updated.status_label}` } }))
    } catch (err) {
      setRowMessage((m) => ({ ...m, [order.id]: { type: 'error', text: getErrorMessage(err, 'Update failed') } }))
    } finally {
      setSavingId(null)
    }
  }

  const openOrder = (id) => update({ order: id }, { resetPage: false })
  const hasFilters = Boolean(values.search || values.payment_method || values.payment_status || values.days)

  return (
    <div className="space-y-5">
      {/* Status tabs with counts (all-time) */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2" role="tablist" aria-label="Filter orders by status">
          {STATUS_TABS.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              role="tab"
              aria-selected={values.status === s}
              onClick={() => update({ status: s })}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${values.status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {label(s)}
              {counts && <span className={`rounded-full px-1.5 text-xs tabular-nums ${values.status === s ? 'bg-white/20' : 'bg-slate-100'}`} data-testid={`tab-count-${s || 'all'}`}>{counts[s || 'all'] ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>

      <section className={cardClass} aria-labelledby="orders-heading">
        <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="orders-heading" className="text-lg font-bold text-slate-900">
              {values.status ? `${label(values.status)} orders` : 'All orders'}{' '}
              {data && <span className="text-sm font-medium text-slate-500" data-testid="order-count">({data.count} {hasFilters || values.status ? 'found' : 'total'})</span>}
            </h2>
            {hasFilters && <button type="button" onClick={() => update({ search: '', payment_method: '', payment_status: '', days: '' })} className="text-sm font-semibold text-brand-700 hover:underline">Clear filters</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <SearchBox id="order-search" label="Search orders" value={values.search} onSearch={(v) => update({ search: v })} placeholder="#order, customer, recipient…" />
            </div>
            <FilterSelect id="ord-method" label="Payment method" value={values.payment_method} onChange={(v) => update({ payment_method: v })} options={[['', 'All methods'], ['card', 'Card'], ['bkash', 'bKash'], ['nagad', 'Nagad'], ['cod', 'Cash on delivery']]} />
            <FilterSelect id="ord-paystatus" label="Payment status" value={values.payment_status} onChange={(v) => update({ payment_status: v })} options={[['', 'Any payment'], ['paid', 'Paid'], ['due', 'Pay on delivery'], ['refunded', 'Refunded']]} />
            <FilterSelect id="ord-days" label="Period" value={values.days} onChange={(v) => update({ days: v })} options={[['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]} />
            <FilterSelect id="ord-sort" label="Sort by" value={values.ordering} onChange={(v) => update({ ordering: v })} options={[['', 'Newest first'], ['oldest', 'Oldest first'], ['total_high', 'Total: high to low'], ['total_low', 'Total: low to high']]} />
          </div>
        </div>

        {!data && loading ? (
          <ListSkeleton label="Loading orders" />
        ) : !data && error ? (
          <div className="p-5"><ErrorMessage message={error} onRetry={reload} /></div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error && <ErrorBanner message={error} onRetry={reload} />}
            {data.results.length === 0 ? (
              <EmptyState testId="orders-empty" title={hasFilters || values.status ? `No ${values.status ? `“${label(values.status)}” ` : ''}orders match` : 'No orders yet'} hint={hasFilters ? 'Try a different search or clear the filters.' : 'Orders appear here once customers check out.'} />
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm" data-testid="orders-table">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Order</th>
                        <th className="px-3 py-3 font-semibold">Customer</th>
                        <th className="px-3 py-3 font-semibold">Date</th>
                        <th className="px-3 py-3 text-right font-semibold">Total</th>
                        <th className="px-3 py-3 font-semibold">Payment</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 text-right font-semibold"><span className="sr-only">Details</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.results.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50" data-testid="admin-order-row">
                          <td className="px-5 py-3">
                            <button type="button" onClick={() => openOrder(o.id)} className="font-semibold text-brand-700 hover:underline">#{o.id}</button>
                            <p className="text-xs text-slate-500">{o.item_count} {o.item_count === 1 ? 'item' : 'items'}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">{o.customer.username}</p>
                            <p className="max-w-48 truncate text-xs text-slate-500">{o.customer.email}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(o.created_at)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <PaymentMark code={o.payment_method} size="sm" />
                              <OrderStatusBadge status={o.payment_status} label={o.payment_status_label} />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <OrderStatusControl order={o} disabled={savingId === o.id} onChange={(s) => changeStatus(o, s)} />
                            {rowMessage[o.id] && (
                              <p className={`mt-1 text-xs ${rowMessage[o.id].type === 'error' ? 'text-red-600' : 'text-brand-700'}`} role="status">{rowMessage[o.id].text}</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button type="button" onClick={() => openOrder(o.id)} className="rounded-full px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" aria-label={`View order ${o.id}`}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 lg:hidden" data-testid="orders-cards">
                  {data.results.map((o) => (
                    <li key={o.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => openOrder(o.id)} className="font-semibold text-brand-700" aria-label={`View order ${o.id}`}>#{o.id}</button>
                        <span className="font-semibold tabular-nums">{formatPrice(o.total_amount)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{o.customer.username} · {formatDate(o.created_at)} · {o.item_count} items</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PaymentMark code={o.payment_method} size="sm" />
                        <OrderStatusBadge status={o.payment_status} label={o.payment_status_label} />
                        <OrderStatusControl order={o} disabled={savingId === o.id} onChange={(s) => changeStatus(o, s)} />
                      </div>
                      {rowMessage[o.id] && <p className={`mt-1 text-xs ${rowMessage[o.id].type === 'error' ? 'text-red-600' : 'text-brand-700'}`} role="status">{rowMessage[o.id].text}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="px-4 pb-5">
              <Pagination page={page} totalPages={data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1} onChange={(p) => update({ page: p > 1 ? p : '' }, { resetPage: false })} />
            </div>
          </div>
        )}
      </section>

      {values.order && <OrderDrawer id={values.order} onClose={() => update({ order: '' }, { resetPage: false })} onUpdated={applyUpdated} />}
    </div>
  )
}
