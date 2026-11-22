import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BarList from '../../components/admin/BarList'
import StatTile from '../../components/admin/StatTile'
import TrendChart from '../../components/admin/TrendChart'
import ErrorMessage from '../../components/ErrorMessage'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import { getAdminStats } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatCompactPrice, formatDate, formatPrice, formatShortDate } from '../../utils/format'

const PERIODS = [7, 30, 90]
const STATUS_LABELS = { paid: 'Paid', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' }

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]'

function PeriodPicker({ days, onChange, busy }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Time period">
      {PERIODS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={days === d}
          disabled={busy && days !== d}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${days === d ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {d} days
        </button>
      ))}
    </div>
  )
}

function Skeleton() {
  const block = 'animate-pulse rounded-2xl bg-slate-200/70'
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-36`} />)}
      </div>
      <div className={`${block} h-80`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${block} h-64`} />
        <div className={`${block} h-64`} />
      </div>
    </div>
  )
}

function SalesTrend({ stats }) {
  const [metric, setMetric] = useState('revenue')
  const [showTable, setShowTable] = useState(false)
  const revenue = metric === 'revenue'
  const points = stats.daily.map((d) => ({ date: d.date, value: revenue ? Number(d.revenue) : d.orders, revenue: Number(d.revenue), orders: d.orders }))
  return (
    <section className={card} aria-labelledby="trend-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trend-heading" className="text-lg font-bold text-slate-900">{revenue ? 'Revenue' : 'Orders'} per day</h2>
          <p className="text-sm text-slate-500">
            {formatShortDate(stats.period.start)} – {formatShortDate(stats.period.end)} ·{' '}
            {revenue ? `${formatPrice(stats.kpis.revenue.value)} received` : `${stats.kpis.orders.value} orders placed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Chart metric">
            {[['revenue', 'Revenue'], ['orders', 'Orders']].map(([key, text]) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${metric === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                {text}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            {showTable ? 'Hide table' : 'View as table'}
          </button>
        </div>
      </div>
      <TrendChart
        points={points}
        label={revenue ? 'Revenue' : 'Orders'}
        formatValue={(v) => (revenue ? formatPrice(v) : `${v} ${v === 1 ? 'order' : 'orders'}`)}
        formatAxis={(v) => (revenue ? formatCompactPrice(v) : Math.round(v).toLocaleString('en-US'))}
        formatDate={formatShortDate}
        tooltipRows={(p) => (revenue ? [{ label: p.orders === 1 ? 'order placed' : 'orders placed', value: p.orders }] : [{ label: 'received', value: formatPrice(p.revenue) }])}
        emptyText={revenue ? 'No payments received in this period yet.' : 'No orders placed in this period yet.'}
      />
      <p className="mt-2 text-xs text-slate-500">Revenue counts paid orders (cash on delivery once delivered). Orders counts every placed order.</p>
      {showTable && (
        <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" data-testid="trend-table">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2 font-semibold">Date</th><th className="px-4 py-2 text-right font-semibold">Revenue</th><th className="px-4 py-2 text-right font-semibold">Orders</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...stats.daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-1.5 text-slate-700">{formatDate(d.date)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{formatPrice(d.revenue)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{d.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecentOrders({ orders }) {
  return (
    <section className={card} aria-labelledby="recent-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-heading" className="text-lg font-bold text-slate-900">Recent orders</h2>
        <Link to="/admin-dashboard/orders" className="text-sm font-semibold text-brand-700 hover:underline">All orders →</Link>
      </div>
      {orders.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No orders yet. New orders will appear here.</p>
      ) : (
        <>
          {/* Table on wider screens */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm" data-testid="recent-orders-table">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Order</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Payment</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3"><Link to={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">#{o.id}</Link></td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-900">{o.customer.username}</p>
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
          {/* Cards on phones */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {orders.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/orders/${o.id}`} className="font-semibold text-brand-700">#{o.id}</Link>
                  <span className="font-semibold tabular-nums">{formatPrice(o.total_amount)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{o.customer.username} · {formatDate(o.created_at)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <OrderStatusBadge status={o.status} label={o.status_label} />
                  <PaymentMark code={o.payment_method} size="sm" />
                  <OrderStatusBadge status={o.payment_status} label={o.payment_status_label} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default function AdminOverviewPage() {
  const [params, setParams] = useSearchParams()
  const days = PERIODS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // Which request the shown numbers/error belong to; anything else is still loading.
  const requestKey = `${days}:${reloadKey}`
  const [settledKey, setSettledKey] = useState(null)
  const loading = settledKey !== requestKey

  useEffect(() => {
    let cancelled = false
    getAdminStats(days)
      .then((d) => {
        if (cancelled) return
        setStats(d)
        setError('')
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load the dashboard.')))
      .finally(() => !cancelled && setSettledKey(`${days}:${reloadKey}`))
    return () => {
      cancelled = true
    }
  }, [days, reloadKey])

  function changeDays(d) {
    const next = new URLSearchParams(params)
    if (d === 30) next.delete('days')
    else next.set('days', String(d))
    setParams(next, { replace: true })
  }

  if (!stats) {
    if (error && !loading) return <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />
    return <Skeleton />
  }

  const k = stats.kpis
  const prevLabel = `previous ${days} days`

  return (
    <div className="space-y-6">
      {/* Filter row: scopes everything below */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500" data-testid="period-caption">
            {formatShortDate(stats.period.start)} – {formatShortDate(stats.period.end)} · compared with {formatShortDate(stats.period.previous_start)} – {formatShortDate(stats.period.previous_end)}
          </p>
        </div>
        <PeriodPicker days={days} onChange={changeDays} busy={loading} />
      </div>
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error} Showing the last loaded numbers.
          <button type="button" onClick={() => setReloadKey((n) => n + 1)} className="font-semibold underline">Try again</button>
        </div>
      )}

      {/* While refetching, keep the frame and dim it (no layout jump) */}
      <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Revenue" icon="payments" value={formatPrice(k.revenue.value)} change={k.revenue.change_pct} current={k.revenue.value} previousLabel={prevLabel} note={`Avg. order ${formatPrice(k.average_order_value.value)} · ${k.paid_orders.value} paid`} testId="kpi-revenue" />
          <StatTile label="Orders" icon="orders" value={k.orders.value.toLocaleString('en-US')} change={k.orders.change_pct} current={k.orders.value} previousLabel={prevLabel} note={`${stats.open_orders} open right now`} to="/admin-dashboard/orders" testId="kpi-orders" />
          <StatTile label="Products" icon="products" value={stats.product_count.toLocaleString('en-US')} change={k.new_products.change_pct} current={k.new_products.value} previousLabel={prevLabel} note={`${k.new_products.value} added · ${stats.low_stock_count} low on stock`} to="/admin-dashboard/products" testId="kpi-products" />
          <StatTile label="Customers" icon="customers" value={stats.customer_count.toLocaleString('en-US')} change={k.new_customers.change_pct} current={k.new_customers.value} previousLabel={prevLabel} note={`${k.new_customers.value} new sign-ups`} testId="kpi-customers" />
        </div>

        <SalesTrend stats={stats} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card} aria-labelledby="status-heading">
            <h2 id="status-heading" className="text-lg font-bold text-slate-900">Orders by status</h2>
            <p className="mb-4 text-sm text-slate-500">Orders placed in the last {days} days</p>
            <BarList
              testId="status-bars"
              ariaLabel="Orders by status"
              emptyText="No orders placed in this period."
              rows={Object.entries(stats.status_breakdown).map(([s, n]) => ({ key: s, label: STATUS_LABELS[s] || s, value: n, display: n.toLocaleString('en-US') }))}
            />
          </section>
          <section className={card} aria-labelledby="methods-heading">
            <h2 id="methods-heading" className="text-lg font-bold text-slate-900">Payment methods</h2>
            <p className="mb-4 text-sm text-slate-500">Orders per method · revenue received</p>
            <BarList
              testId="method-bars"
              ariaLabel="Orders by payment method"
              emptyText="No orders placed in this period."
              rows={stats.payment_methods.map((m) => ({ key: m.method, label: m.label, value: m.orders, display: `${m.orders}`, sub: formatPrice(m.revenue) }))}
            />
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className={`${card} lg:col-span-2`} aria-labelledby="top-heading">
            <h2 id="top-heading" className="text-lg font-bold text-slate-900">Top products</h2>
            <p className="mb-4 text-sm text-slate-500">By revenue from paid orders</p>
            {stats.top_products.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500" data-testid="top-products-empty">No paid orders in this period yet.</p>
            ) : (
              <ol className="space-y-3" data-testid="top-products">
                {stats.top_products.map((t, i) => (
                  <li key={`${t.product_id}-${t.name}`} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-slate-400">{i + 1}</span>
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {t.image && <img src={t.image} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {t.product_id ? (
                        <Link to={`/products/${t.product_id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">{t.name}</Link>
                      ) : (
                        <span className="block truncate text-sm font-medium text-slate-900">{t.name}</span>
                      )}
                      <span className="text-xs text-slate-500">{t.quantity} sold</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900">{formatPrice(t.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="lg:col-span-3">
            <RecentOrders orders={stats.recent_orders} />
          </div>
        </div>

        {/* All-time numbers + quick links */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={card}>
            <p className="text-sm text-slate-500">All-time sales</p>
            <p className="mt-1 text-2xl font-bold text-slate-900" data-testid="stat-sales">{formatPrice(stats.total_sales)}</p>
            <p className="text-xs text-slate-500">{stats.sales_count} paid orders · {stats.order_count} placed</p>
          </div>
          <Link to="/admin-dashboard/orders" className={`${card} transition hover:border-brand-300`}>
            <p className="text-sm text-slate-500">Open orders</p>
            <p className="mt-1 text-2xl font-bold text-slate-900" data-testid="stat-open">{stats.open_orders}</p>
            <p className="text-xs text-slate-500">Paid, processing or shipped</p>
          </Link>
          <Link to="/admin-dashboard/products?low_stock=true" className={`${card} transition hover:border-amber-300`}>
            <p className="text-sm text-slate-500">Low-stock products</p>
            <p className="mt-1 text-2xl font-bold text-amber-700" data-testid="stat-low-stock">{stats.low_stock_count}</p>
            <p className="text-xs text-slate-500">{stats.low_stock_threshold} or fewer left · {stats.out_of_stock_count} out of stock</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
