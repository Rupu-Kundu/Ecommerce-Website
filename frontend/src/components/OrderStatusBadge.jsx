const STYLES = {
  pending: 'bg-slate-100 text-slate-700',
  paid: 'bg-brand-50 text-brand-800 ring-brand-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  shipped: 'bg-violet-50 text-violet-800 ring-violet-200',
  delivered: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  succeeded: 'bg-emerald-50 text-emerald-800 ring-emerald-200', // payment
  refunded: 'bg-amber-50 text-amber-800 ring-amber-200',
  due: 'bg-orange-50 text-orange-800 ring-orange-200', // cash on delivery, not collected yet
}

/** Coloured pill for an order status or payment status. */
export default function OrderStatusBadge({ status, label }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-transparent ${STYLES[status] || STYLES.pending}`}
      data-testid="status-badge"
    >
      {label || status}
    </span>
  )
}
