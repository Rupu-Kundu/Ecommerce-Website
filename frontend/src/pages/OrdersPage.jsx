import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import OrderStatusBadge from '../components/OrderStatusBadge'
import Pagination from '../components/Pagination'
import { PaymentMark } from '../components/PaymentMethodPicker'
import ProductImage from '../components/ProductImage'
import { getErrorMessage } from '../services/api'
import { getOrders } from '../services/orderService'
import { formatDate, formatPrice } from '../utils/format'

const PAGE_SIZE = 12

export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page')) || 1
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getOrders(page)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError('')
        }
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load your orders.')))
    return () => {
      cancelled = true
    }
  }, [page, reloadKey])

  if (error) return <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!data) return <Loader label="Loading your orders…" />

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">My orders</h1>

      {data.count === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-lg font-medium text-slate-900">No orders yet</p>
          <p className="mt-1 text-sm text-slate-500">When you place an order, it will appear here.</p>
          <Link to="/products" className="mt-6 inline-block rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {data.results.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm sm:flex-row sm:items-center"
                  data-testid="order-row"
                >
                  <div className="flex -space-x-3">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white bg-slate-100">
                        <ProductImage product={{ name: item.product_name, image: item.image }} className="text-lg" />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">Order #{order.id}</span>
                      <OrderStatusBadge status={order.status} label={order.status_label} />
                      {order.payment_status === 'refunded' && <OrderStatusBadge status="refunded" label="Refunded" />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {formatDate(order.created_at)} · {order.item_count} {order.item_count === 1 ? 'item' : 'items'} ·{' '}
                      {order.items.map((i) => i.product_name).join(', ')}
                    </p>
                  </div>
                  <span className="flex items-center gap-3">
                    <PaymentMark code={order.payment_method} size="sm" />
                    <span className="text-lg font-bold tabular-nums text-slate-900">{formatPrice(order.total_amount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.ceil(data.count / PAGE_SIZE)}
            onChange={(p) => setParams(p > 1 ? { page: String(p) } : {})}
          />
        </>
      )}
    </div>
  )
}
