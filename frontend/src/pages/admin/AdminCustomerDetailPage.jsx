import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ActiveBadge, Avatar } from '../../components/admin/CustomerBits'
import ErrorMessage from '../../components/ErrorMessage'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import Pagination from '../../components/Pagination'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import { getAdminCustomer, getAdminOrders } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatDate, formatPrice } from '../../utils/format'

const PAGE_SIZE = 12
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]'

function Stat({ label, value, note, testId }) {
  return (
    <div className={card}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900" data-testid={testId}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/admin-dashboard/customers" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
      ← All customers
    </Link>
  )
}

/** One customer's paginated orders, from the existing GET /api/orders/?customer=<id>. */
function OrderHistory({ customerId }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${customerId}:${page}:${reloadKey}`
  const [settledKey, setSettledKey] = useState(null)
  const loading = settledKey !== requestKey

  useEffect(() => {
    let cancelled = false
    getAdminOrders({ customer: customerId, page })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load orders.')))
      .finally(() => !cancelled && setSettledKey(`${customerId}:${page}:${reloadKey}`))
    return () => {
      cancelled = true
    }
  }, [customerId, page, reloadKey])

  return (
    <section className={card} aria-labelledby="history-heading">
      <h2 id="history-heading" className="mb-4 text-lg font-bold text-slate-900">
        Order history {data && <span className="text-sm font-medium text-slate-500">({data.count})</span>}
      </h2>
      {!data && loading ? (
        <div className="space-y-3" aria-label="Loading orders" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : !data && error ? (
        <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : data.results.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500" data-testid="history-empty">This customer hasn't placed any orders yet.</p>
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm" data-testid="history-table">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Order</th>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Payment</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-3">
                      <Link to={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">#{o.id}</Link>
                      <p className="text-xs text-slate-500">{o.item_count} {o.item_count === 1 ? 'item' : 'items'}</p>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-slate-600">{formatDate(o.created_at)}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <PaymentMark code={o.payment_method} size="sm" />
                        <OrderStatusBadge status={o.payment_status} label={o.payment_status_label} />
                      </div>
                    </td>
                    <td className="py-3 pr-3"><OrderStatusBadge status={o.status} label={o.status_label} /></td>
                    <td className="py-3 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(data.count / PAGE_SIZE))} onChange={setPage} />
        </div>
      )}
    </section>
  )
}

export default function AdminCustomerDetailPage() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getAdminCustomer(id)
      .then((d) => {
        if (cancelled) return
        setCustomer(d)
        setError('')
        setNotFound(false)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) setNotFound(true)
        else setError(getErrorMessage(err, 'Could not load this customer.'))
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  if (notFound) {
    return (
      <div className={`${card} py-14 text-center`} data-testid="customer-not-found">
        <p className="text-lg font-semibold text-slate-900">Customer not found</p>
        <p className="mt-1 text-sm text-slate-500">This account doesn't exist or isn't a customer account.</p>
        <div className="mt-4"><BackLink /></div>
      </div>
    )
  }
  if (error && !customer) return <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!customer || String(customer.id) !== String(id)) {
    return (
      <div className="space-y-6" aria-label="Loading customer" aria-busy="true">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />)}</div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    )
  }

  const s = customer.stats
  const name = customer.full_name || customer.username

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Profile */}
      <section className={`${card} flex flex-col gap-4 sm:flex-row sm:items-center`} aria-label="Customer profile">
        <Avatar name={name} size="h-16 w-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900" data-testid="customer-name">{name}</h2>
            <ActiveBadge active={customer.is_active} />
          </div>
          <p className="text-sm text-slate-500">@{customer.username}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={`mailto:${customer.email}`} className="break-all text-brand-700 hover:underline">{customer.email}</a>
            {customer.phone ? <a href={`tel:${customer.phone}`} className="text-brand-700 hover:underline">{customer.phone}</a> : <span className="text-slate-400">No phone</span>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
          <dt className="text-slate-500">Joined</dt><dd className="font-medium text-slate-900">{formatDate(customer.date_joined)}</dd>
          <dt className="text-slate-500">Last login</dt><dd className="font-medium text-slate-900">{customer.last_login ? formatDate(customer.last_login) : 'Never'}</dd>
        </dl>
      </section>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={s.orders_count} note={`${s.open_orders} open · ${s.cancelled_orders} cancelled`} testId="cust-orders" />
        <Stat label="Total spent" value={formatPrice(s.total_spent)} note={`${s.paid_orders} paid${Number(s.cod_due) > 0 ? ` · ${formatPrice(s.cod_due)} cash due` : ''}`} testId="cust-spent" />
        <Stat label="Average order" value={formatPrice(s.average_order_value)} note="Paid orders only" testId="cust-aov" />
        <Stat label="Last order" value={s.last_order_at ? formatDate(s.last_order_at) : '—'} note={s.first_order_at ? `First: ${formatDate(s.first_order_at)}` : 'No orders yet'} testId="cust-last" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* min-w-0: let the wide order table scroll inside its card instead of widening the page */}
        <div className="min-w-0 lg:col-span-2">
          <OrderHistory customerId={customer.id} />
        </div>
        <div className="min-w-0 space-y-6">
          <section className={card} aria-labelledby="addr-heading">
            <h2 id="addr-heading" className="mb-3 text-lg font-bold text-slate-900">Saved addresses</h2>
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-slate-500">No saved addresses.</p>
            ) : (
              <ul className="space-y-3 text-sm" data-testid="addresses">
                {customer.addresses.map((a) => (
                  <li key={a.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="font-semibold text-slate-900">{a.recipient_name} <span className="font-normal text-slate-500">· {a.phone}</span></p>
                    <p className="text-slate-600">{a.street_address}, {a.city} {a.postal_code}, {a.country}</p>
                    {a.latitude != null && <p className="mt-0.5 text-xs font-medium text-brand-700">📍 Map pin saved</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={card} aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="mb-3 text-lg font-bold text-slate-900">Activity</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Product reviews</dt><dd className="font-semibold" data-testid="cust-reviews">{customer.reviews_count}</dd></div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Live chats</dt>
                <dd className="font-semibold">
                  {customer.chats_count > 0 ? <Link to="/admin-dashboard/chat?status=all" className="text-brand-700 hover:underline">{customer.chats_count}</Link> : 0}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
