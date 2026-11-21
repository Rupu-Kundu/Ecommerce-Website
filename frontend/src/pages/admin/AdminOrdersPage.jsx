import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../../components/ErrorMessage'
import Loader from '../../components/Loader'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import Pagination from '../../components/Pagination'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import { getAdminOrders, updateOrderStatus } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { formatDate, formatPrice } from '../../utils/format'

const PAGE_SIZE = 12
const FILTERS = ['', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
const STATUS_OPTIONS = ['paid', 'processing', 'shipped', 'delivered', 'cancelled']
const label = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All')

export default function AdminOrdersPage() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page')) || 1
  const status = params.get('status') || ''
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [rowMessage, setRowMessage] = useState({}) // {orderId: {type, text}}
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    getAdminOrders({ page, status })
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError('')
        }
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load orders.')))
    return () => {
      cancelled = true
    }
  }, [page, status])

  async function changeStatus(order, newStatus) {
    if (newStatus === order.status) return
    setSavingId(order.id)
    try {
      const updated = await updateOrderStatus(order.id, newStatus)
      setData((d) => ({ ...d, results: d.results.map((o) => (o.id === order.id ? updated : o)) }))
      setRowMessage((m) => ({ ...m, [order.id]: { type: 'ok', text: `Updated to ${updated.status_label}` } }))
    } catch (err) {
      setRowMessage((m) => ({ ...m, [order.id]: { type: 'error', text: getErrorMessage(err, 'Update failed') } }))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter orders by status">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            role="tab"
            aria-selected={status === f}
            onClick={() => setParams(f ? { status: f } : {})}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${status === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {label(f)}
          </button>
        ))}
      </div>

      {error && <ErrorMessage message={error} />}
      {!data && !error && <Loader label="Loading orders…" />}

      {data && (
        <>
          <p className="mb-2 text-sm text-slate-500">{data.count} orders</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((o) => (
                  <tr key={o.id} data-testid="admin-order-row">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">#{o.id}</Link>
                      <p className="text-xs text-slate-500">{o.item_count} items</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{o.customer.username}</p>
                      <p className="text-xs text-slate-500">{o.customer.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PaymentMark code={o.payment_method} size="sm" />
                        <OrderStatusBadge status={o.payment_status} label={o.payment_status_label} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {o.payment_status === 'paid' ? (
                        <select
                          aria-label={`Status for order ${o.id}`}
                          value={o.status}
                          disabled={savingId === o.id}
                          onChange={(e) => changeStatus(o, e.target.value)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                      ) : (
                        <OrderStatusBadge status={o.status} label={o.status_label} />
                      )}
                      {rowMessage[o.id] && (
                        <p className={`mt-1 text-xs ${rowMessage[o.id].type === 'error' ? 'text-red-600' : 'text-brand-700'}`} role="status">
                          {rowMessage[o.id].text}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {data.results.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No orders{status && ` with status “${label(status)}”`}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={Math.ceil(data.count / PAGE_SIZE)}
            onChange={(p) => setParams({ ...(status && { status }), ...(p > 1 && { page: String(p) }) })}
          />
        </>
      )}
    </div>
  )
}
