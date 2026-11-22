import OrderStatusBadge from '../../components/OrderStatusBadge'

const STATUS_OPTIONS = ['paid', 'processing', 'shipped', 'delivered', 'cancelled']
const label = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Status picker for an order, following the server's rules: only paid orders and
 * confirmed (not cancelled) cash-on-delivery orders can change status; a COD order is
 * never "Paid" (it becomes paid when Delivered). Other orders show a read-only badge.
 */
export default function OrderStatusControl({ order, disabled, onChange, className = '' }) {
  const editable = order.payment_status === 'paid' || (order.payment_status === 'due' && order.status !== 'cancelled')
  if (!editable) return <OrderStatusBadge status={order.status} label={order.status_label} />
  return (
    <select
      aria-label={`Status for order ${order.id}`}
      value={order.status}
      disabled={disabled}
      onChange={(e) => e.target.value !== order.status && onChange(e.target.value)}
      className={`rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:opacity-60 ${className}`}
    >
      {STATUS_OPTIONS.filter((s) => !(order.payment_status === 'due' && s === 'paid')).map((s) => <option key={s} value={s}>{label(s)}</option>)}
    </select>
  )
}
