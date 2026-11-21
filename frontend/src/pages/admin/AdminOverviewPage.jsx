import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../../components/ErrorMessage'
import Loader from '../../components/Loader'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import { getAdminStats } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatDate, formatPrice } from '../../utils/format'

function StatCard({ label, value, hint, to, tone = 'brand', testId }) {
  const tones = {
    brand: 'text-brand-700',
    amber: 'text-amber-600',
    sky: 'text-sky-700',
    slate: 'text-slate-900',
  }
  const body = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold tracking-tight tabular-nums ${tones[tone]}`} data-testid={testId}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  )
  const cls = 'block rounded-2xl border border-slate-200 bg-white p-5 transition'
  return to ? <Link to={to} className={`${cls} hover:border-brand-300 hover:shadow-sm`}>{body}</Link> : <div className={cls}>{body}</div>
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getAdminStats()
      .then((d) => {
        if (!cancelled) {
          setStats(d)
          setError('')
        }
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load dashboard.')))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  if (error) return <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!stats) return <Loader label="Loading dashboard…" />

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total sales" value={formatPrice(stats.total_sales)} hint={`${stats.sales_count} paid orders`} testId="stat-sales" />
        <StatCard label="Current orders" value={stats.open_orders} hint="Paid, processing or shipped" to="/admin-dashboard/orders" tone="sky" testId="stat-open" />
        <StatCard
          label="Low-stock products"
          value={stats.low_stock_count}
          hint={`${stats.low_stock_threshold} or fewer left · ${stats.out_of_stock_count} out of stock`}
          to="/admin-dashboard/products?low_stock=true"
          tone="amber"
          testId="stat-low-stock"
        />
        <StatCard label="Products · Customers" value={`${stats.product_count} · ${stats.customer_count}`} hint={`${stats.order_count} orders in total`} tone="slate" testId="stat-catalogue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2" aria-label="Recent orders">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Recent orders</h2>
            <Link to="/admin-dashboard/orders" className="text-sm font-semibold text-brand-700 hover:underline">All orders →</Link>
          </div>
          {stats.recent_orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recent_orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <span className="font-semibold text-slate-900">#{o.id}</span>{' '}
                    <span className="text-slate-500">· {o.customer.username} · {formatDate(o.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={o.status} label={o.status_label} />
                    <span className="w-24 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Orders by status">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Orders by status</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(stats.orders_by_status).filter(([s]) => s !== 'pending').map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                <OrderStatusBadge status={status} label={status.charAt(0).toUpperCase() + status.slice(1)} />
                <span className="font-semibold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
