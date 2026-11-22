import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import OrderStatusBadge from '../components/OrderStatusBadge'
import ProductImage from '../components/ProductImage'
import { getErrorMessage } from '../services/api'
import { cancelOrder, getOrder } from '../services/orderService'
import { formatDate, formatPrice } from '../utils/format'
import NotFoundPage from './NotFoundPage'
import { LazyLocationMap } from '../components/map/LazyMaps'

const STEPS = ['paid', 'processing', 'shipped', 'delivered']

export default function OrderDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const justPlacedCod = params.get('placed') === 'cod'
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelled, setCancelled] = useState(false)

  async function handleCancel() {
    setCancelling(true)
    setCancelError('')
    try {
      setOrder(await cancelOrder(order.id))
      setCancelled(true)
      setConfirmCancel(false)
    } catch (err) {
      setCancelError(getErrorMessage(err, 'Could not cancel the order. Please try again.'))
      setConfirmCancel(false)
      // the order may have changed meanwhile (e.g. just shipped) — show the latest state
      getOrder(order.id).then(setOrder).catch(() => {})
    } finally {
      setCancelling(false)
    }
  }
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
  const cod = order.payment_method === 'cod'

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/orders" className="hover:text-brand-700">My orders</Link>
        <span className="mx-2">/</span>
        <span>Order #{order.id}</span>
      </nav>

      {justPlacedCod && !cancelled && order.status !== 'cancelled' && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" role="status" data-testid="cod-placed">
          <p className="font-bold">🎉 Order placed! Thank you.</p>
          <p className="mt-1 text-sm">
            Please keep <strong>{formatPrice(order.total_amount)}</strong> ready and pay the rider in cash when your order arrives.
            {' '}Changed your mind? You can cancel until the order ships.
          </p>
        </div>
      )}
      {cancelled && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800" role="status" data-testid="order-cancelled">
          <p className="font-bold">Your order has been cancelled.</p>
          <p className="mt-1 text-sm">Nothing to pay. <Link to="/products" className="font-semibold text-brand-700 hover:underline">Continue shopping</Link></p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Order #{order.id}</h1>
        <OrderStatusBadge status={order.status} label={order.status_label} />
        {order.payment_status === 'refunded' && <OrderStatusBadge status="refunded" label="Refunded" />}
        {order.payment_status === 'due' && order.status !== 'cancelled' && <OrderStatusBadge status="due" label="Pay on delivery" />}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Placed {formatDate(order.created_at)} · Payment:{' '}
        <span className="font-medium text-slate-700" data-testid="payment-status">{order.payment_status_label}</span>
        {' '}· <span className="font-medium text-slate-700" data-testid="payment-method">{order.payment_method_label}</span>
      </p>

      {order.can_cancel && (
        <div className="mt-4" data-testid="cancel-order">
          {!confirmCancel ? (
            <button
              type="button"
              onClick={() => {
                setConfirmCancel(true)
                setCancelError('')
              }}
              className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Cancel order
            </button>
          ) : (
            <div role="alertdialog" aria-labelledby="cancel-title" aria-describedby="cancel-desc" className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-4">
              <p id="cancel-title" className="font-semibold text-red-900">Cancel order #{order.id}?</p>
              <p id="cancel-desc" className="mt-1 text-sm text-red-800">
                The items go back to our stock and you won't need to pay anything. This can't be undone.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleCancel} disabled={cancelling} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {cancelling ? 'Cancelling…' : 'Yes, cancel order'}
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelling} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">
                  Keep my order
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {cancelError && <p role="alert" className="mt-3 text-sm text-red-600">{cancelError}</p>}

      {stepIndex >= 0 && (
        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Order progress">
          {STEPS.map((step, i) => (
            <li key={step} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <span className={`mt-2 block text-xs font-medium capitalize ${i <= stepIndex ? 'text-brand-800' : 'text-slate-400'}`}>{step === 'paid' && cod ? 'confirmed' : step}</span>
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
              {address.latitude != null && address.longitude != null && (
                <div className="mt-3">
                  <LazyLocationMap lat={address.latitude} lng={address.longitude} label="Delivery pin" className="h-48" />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
