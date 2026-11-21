import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import OrderStatusBadge from '../components/OrderStatusBadge'
import ProductImage from '../components/ProductImage'
import { getErrorMessage } from '../services/api'
import { getOrder } from '../services/orderService'
import { formatDate, formatPrice } from '../utils/format'
import NotFoundPage from './NotFoundPage'

const STEPS = ['paid', 'processing', 'shipped', 'delivered']

export default function OrderDetailPage() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    getOrder(id)
      .then((data) => !cancelled && setOrder(data))
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) setNotFound(true)
        else setError(getErrorMessage(err, 'Could not load this order.'))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (notFound) return <NotFoundPage message="This order doesn't exist or isn't yours." />
  if (error) return <ErrorMessage message={error} />
  if (!order) return <Loader label="Loading order…" />

  const stepIndex = STEPS.indexOf(order.status)
  const address = order.address

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/orders" className="hover:text-brand-700">My orders</Link>
        <span className="mx-2">/</span>
        <span>Order #{order.id}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Order #{order.id}</h1>
        <OrderStatusBadge status={order.status} label={order.status_label} />
        {order.payment_status === 'refunded' && <OrderStatusBadge status="refunded" label="Refunded" />}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Placed {formatDate(order.created_at)} · Payment:{' '}
        <span className="font-medium text-slate-700" data-testid="payment-status">{order.payment_status_label}</span>
        {' '}· <span className="font-medium text-slate-700" data-testid="payment-method">{order.payment_method_label}</span>
      </p>

      {stepIndex >= 0 && (
        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Order progress">
          {STEPS.map((step, i) => (
            <li key={step} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <span className={`mt-2 block text-xs font-medium capitalize ${i <= stepIndex ? 'text-brand-800' : 'text-slate-400'}`}>{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2" aria-label="Items">
          <h2 className="mb-2 text-lg font-bold text-slate-900">Items</h2>
          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 py-3" data-testid="order-item">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <ProductImage product={{ name: item.product_name, image: item.image }} className="text-xl" />
                </div>
                <div className="min-w-0 flex-1">
                  {item.product_id ? (
                    <Link to={`/products/${item.product_id}`} className="font-semibold text-slate-900 hover:text-brand-700">{item.product_name}</Link>
                  ) : (
                    <span className="font-semibold text-slate-900">{item.product_name}</span>
                  )}
                  <p className="text-sm text-slate-500">{formatPrice(item.price)} × {item.quantity}</p>
                </div>
                <span className="font-semibold tabular-nums">{formatPrice(item.line_total)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Payment summary">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Subtotal ({order.item_count} items)</dt><dd data-testid="order-subtotal">{formatPrice(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">{order.shipping_method_label}</dt><dd data-testid="order-shipping">{Number(order.shipping_cost) === 0 ? 'Free' : formatPrice(order.shipping_cost)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold" data-testid="order-total">{formatPrice(order.total_amount)}</dd>
              </div>
            </dl>
          </section>

          {address && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm" aria-label="Shipping address">
              <h2 className="mb-2 text-lg font-bold text-slate-900">Delivery</h2>
              <p className="font-semibold text-slate-900">{address.recipient_name}</p>
              <p className="text-slate-600">{address.phone}</p>
              <p className="mt-1 text-slate-600">{address.street_address}, {address.city} {address.postal_code}, {address.country}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
