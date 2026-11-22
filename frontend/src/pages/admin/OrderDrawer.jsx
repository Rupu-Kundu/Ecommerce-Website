import { useState } from 'react'
import { Link } from 'react-router-dom'
import Drawer from '../../components/admin/Drawer'
import ErrorMessage from '../../components/ErrorMessage'
import { LazyLocationMap } from '../../components/map/LazyMaps'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import useApiData from '../../hooks/useApiData'
import { getAdminPayments, updateOrderStatus } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { getOrder } from '../../services/orderService'
import { formatPrice } from '../../utils/format'
import OrderStatusControl from './OrderStatusControl'

const STEPS = ['paid', 'processing', 'shipped', 'delivered']
const dateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/** Full details of one order for admins (existing GET /api/orders/<id>/ + its payments). */
export default function OrderDrawer({ id, onClose, onUpdated }) {
  const { data: order, setData: setOrder, error, loading, reload } = useApiData(`order-${id}`, () => getOrder(id), 'Could not load this order.')
  const { data: payments } = useApiData(`order-payments-${id}`, () => getAdminPayments({ order: id }), 'Could not load payments.')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const ready = order && String(order.id) === String(id) && !loading

  async function changeStatus(next) {
    setSaving(true)
    setMessage(null)
    try {
      const updated = await updateOrderStatus(order.id, next)
      setOrder((prev) => ({ ...prev, ...updated })) // keep anything the reply leaves out
      setMessage({ type: 'ok', text: updated.payment_method === 'cod' && next === 'delivered' ? 'Delivered · cash collected' : `Updated to ${updated.status_label}` })
      onUpdated?.(updated)
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Update failed') })
    } finally {
      setSaving(false)
    }
  }

  const step = ready ? STEPS.indexOf(order.status) : -1
  const cod = ready && order.payment_method === 'cod'
  return (
    <Drawer
      open
      onClose={onClose}
      testId="order-drawer"
      title={`Order #${id}`}
      subtitle={ready && <>Placed {dateTime(order.created_at)}</>}
      footer={ready && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/orders/${order.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Open customer view →</Link>
          {order.customer && <Link to={`/admin-dashboard/customers/${order.customer.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Customer profile →</Link>}
        </div>
      )}
    >
      {!ready && error && !loading ? (
        <ErrorMessage message={error} onRetry={reload} />
      ) : !ready ? (
        <div className="space-y-3" aria-label="Loading order" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status */}
          <section className="rounded-2xl bg-slate-50 p-4" aria-labelledby="od-status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="od-status" className="text-sm font-bold uppercase tracking-wide text-slate-500">Status</h3>
              <OrderStatusControl order={order} disabled={saving} onChange={changeStatus} />
            </div>
            {message && <p role="status" className={`mt-2 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-brand-700'}`} data-testid="drawer-status-message">{message.text}</p>}
            {step >= 0 && (
              <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Progress">
                {STEPS.map((s, i) => (
                  <li key={s}>
                    <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-slate-200'}`} />
                    <span className={`mt-1 block text-[11px] font-medium capitalize ${i <= step ? 'text-brand-800' : 'text-slate-400'}`}>{s === 'paid' && cod ? 'confirmed' : s}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              Payment <PaymentMark code={order.payment_method} size="sm" /> <OrderStatusBadge status={order.payment_status} label={order.payment_status_label} />
            </div>
          </section>

          {/* Customer */}
          <section aria-labelledby="od-customer">
            <h3 id="od-customer" className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Customer</h3>
            <dl className="divide-y divide-slate-100">
              <Row label="Account">
                <Link to={`/admin-dashboard/customers/${order.customer.id}`} className="text-brand-700 hover:underline" data-testid="drawer-order-customer">{order.customer.username}</Link>
              </Row>
              <Row label="Email"><span className="break-all">{order.customer.email}</span></Row>
            </dl>
          </section>

          {/* Items */}
          <section aria-labelledby="od-items">
            <h3 id="od-items" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Items ({order.item_count})</h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="drawer-order-items">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    {it.product_id ? <Link to={`/products/${it.product_id}`} className="block truncate hover:text-brand-700">{it.product_name}</Link> : <span className="block truncate">{it.product_name}</span>}
                    <span className="text-xs text-slate-500">{formatPrice(it.price)} × {it.quantity}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatPrice(it.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2">
              <Row label="Subtotal">{formatPrice(order.subtotal)}</Row>
              <Row label={order.shipping_method_label || 'Shipping'}>{Number(order.shipping_cost) === 0 ? 'Free' : formatPrice(order.shipping_cost)}</Row>
              <Row label="Total"><span className="text-base" data-testid="drawer-order-total">{formatPrice(order.total_amount)}</span></Row>
            </dl>
          </section>

          {/* Delivery */}
          <section aria-labelledby="od-delivery">
            <h3 id="od-delivery" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Delivery</h3>
            {order.address ? (
              <div className="space-y-3">
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="drawer-order-address">
                  <span className="font-semibold text-slate-900">{order.address.recipient_name}</span> · {order.address.phone}<br />
                  {order.address.street_address}, {order.address.city} {order.address.postal_code}, {order.address.country}
                </p>
                {order.address.latitude != null && order.address.longitude != null && (
                  <LazyLocationMap lat={order.address.latitude} lng={order.address.longitude} label="Delivery pin" className="h-44" />
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No address saved.</p>
            )}
          </section>

          {/* Payments */}
          <section aria-labelledby="od-payments">
            <h3 id="od-payments" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Payments</h3>
            {!payments ? (
              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ) : payments.results.length === 0 ? (
              <p className="text-sm text-slate-500">No payment attempts recorded.</p>
            ) : (
              <ul className="space-y-2" data-testid="drawer-order-payments">
                {payments.results.map((p) => (
                  <li key={p.id}>
                    <Link to={`/admin-dashboard/payments?payment=${p.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{p.transaction_id}</span>
                        <span className="text-xs text-slate-500">{p.provider_label} · {dateTime(p.created_at)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatPrice(p.amount)}</span>
                        <OrderStatusBadge status={p.status} label={p.status_label} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}
